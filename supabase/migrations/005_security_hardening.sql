-- =============================================================================
-- MySanad Migration 005: Security hardening (Phase 1)
--
-- Fixes found in the Phase 1 audit:
--   * promote_user_to_super_admin() was callable by anon/authenticated (privilege escalation)
--   * teachers could self-approve / self-publish their own records
--   * public read on base tables exposed private columns (IC, phone, address, internal notes)
--   * recursive RLS policy on profiles (infinite recursion on update)
--   * SECURITY DEFINER functions without a pinned search_path
--   * no profile row created on sign-up, no storage policies, missing policies on
--     ijazah_records / teacher_public_settings / public_contact_channels
--   * collision-unsafe sanad / submission codes, audit inserts that could never succeed
--
-- Design:
--   * Base tables are readable only by the owner and administrators.
--   * Public visitors read through narrow SECURITY-BARRIER views (v_public_*).
--   * Protected columns (status, publish flags, badges, reviewer fields) are guarded by
--     BEFORE triggers: only administrators or trusted backend roles may change them.
--   * Every change to sensitive tables is written to audit_logs by trigger.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Helper functions: pin search_path, lock down bootstrap function
-- -----------------------------------------------------------------------------
ALTER FUNCTION public.get_current_user_role() SET search_path = public;
ALTER FUNCTION public.is_admin_or_verifier() SET search_path = public;
ALTER FUNCTION public.is_super_admin() SET search_path = public;
ALTER FUNCTION public.promote_user_to_super_admin(TEXT) SET search_path = public, auth;

-- Bootstrap must only be run from the SQL editor / service role, never via the public API.
REVOKE EXECUTE ON FUNCTION public.promote_user_to_super_admin(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.promote_user_to_super_admin(TEXT) FROM anon, authenticated;

-- TRUE when the statement is not running as an end-user API role
-- (service_role, postgres, or inside a SECURITY DEFINER function owned by postgres).
CREATE OR REPLACE FUNCTION public.is_trusted_backend()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    SELECT current_user NOT IN ('anon', 'authenticated');
$$;

-- Status transitions a record owner (teacher) may make on their own records.
CREATE OR REPLACE FUNCTION public.owner_status_change_allowed(
    old_status verification_status,
    new_status verification_status
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT old_status IS NOT DISTINCT FROM new_status
        OR (new_status IN ('draft', 'submitted')
            AND old_status IN ('draft', 'submitted', 'revision_required'));
$$;

-- Publicly visible teacher (used by policies that anon evaluates; anon cannot read teachers).
CREATE OR REPLACE FUNCTION public.is_teacher_public(p_teacher_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.teachers t
        JOIN public.profiles p ON p.id = t.profile_id
        WHERE t.id = p_teacher_id
          AND t.is_published = TRUE
          AND t.profile_verification_status = 'published'
          AND t.archived_at IS NULL
          AND p.is_active = TRUE
    );
$$;

CREATE OR REPLACE FUNCTION public.is_sanad_chain_public(p_chain_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.sanad_chains sc
        WHERE sc.id = p_chain_id
          AND sc.is_public = TRUE
          AND sc.verification_status IN ('approved', 'published')
          AND public.is_teacher_public(sc.teacher_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.owns_teacher(p_teacher_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.teachers t
        WHERE t.id = p_teacher_id AND t.profile_id = auth.uid()
    );
$$;

-- -----------------------------------------------------------------------------
-- 2. Collision-safe generated codes
-- -----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.sanad_code_seq START 1;
CREATE SEQUENCE IF NOT EXISTS public.submission_code_seq START 1;

ALTER TABLE public.sanad_chains
    ALTER COLUMN sanad_code SET DEFAULT ('SND-' || LPAD(nextval('public.sanad_code_seq')::TEXT, 6, '0'));
ALTER TABLE public.verification_submissions
    ALTER COLUMN submission_code SET DEFAULT ('SUB-' || LPAD(nextval('public.submission_code_seq')::TEXT, 6, '0'));

-- At most one open submission per target record.
CREATE UNIQUE INDEX IF NOT EXISTS uq_verification_submissions_open_target
    ON public.verification_submissions (target_type, target_record_id)
    WHERE status IN ('submitted', 'under_review');

-- -----------------------------------------------------------------------------
-- 3. Profiles: auto-create on sign-up, fix recursive policy, guard role changes
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Role is ALWAYS registered_teacher; user-supplied metadata can never set a role.
    INSERT INTO public.profiles (id, email, full_name, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.email, NEW.id::TEXT || '@tiada-emel.invalid'),
        LEFT(COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data ->> 'full_name'), ''),
                      SPLIT_PART(COALESCE(NEW.email, 'pengguna'), '@', 1)), 255),
        'registered_teacher'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_auth_user_email_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.email IS DISTINCT FROM OLD.email AND NEW.email IS NOT NULL THEN
        UPDATE public.profiles SET email = NEW.email, updated_at = NOW() WHERE id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_auth_user_email_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed
    AFTER UPDATE OF email ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_email_change();

-- The old WITH CHECK queried profiles from inside a profiles policy (infinite recursion).
DROP POLICY IF EXISTS "Users update own profile without changing role" ON public.profiles;
CREATE POLICY "Users update own profile" ON public.profiles
    FOR UPDATE USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_profiles_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF public.is_trusted_backend() THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.role := 'registered_teacher';
        NEW.is_active := TRUE;
        RETURN NEW;
    END IF;

    IF NEW.id <> OLD.id OR NEW.email IS DISTINCT FROM OLD.email THEN
        RAISE EXCEPTION 'Emel dan ID profil tidak boleh diubah secara terus.'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.role IS DISTINCT FROM OLD.role OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
        IF NOT public.is_super_admin() THEN
            RAISE EXCEPTION 'Hanya Super Admin boleh menukar peranan atau status akaun.'
                USING ERRCODE = '42501';
        END IF;
        IF OLD.id = auth.uid() THEN
            RAISE EXCEPTION 'Super Admin tidak boleh menukar peranan atau status akaun sendiri.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profiles ON public.profiles;
CREATE TRIGGER trg_guard_profiles
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_privileged_columns();

-- -----------------------------------------------------------------------------
-- 4. Teachers: no public base-table read, guard protected columns
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read published teachers" ON public.teachers;
CREATE POLICY "Owner or admin read teachers" ON public.teachers
    FOR SELECT USING (profile_id = auth.uid() OR public.is_admin_or_verifier());

DROP POLICY IF EXISTS "Teacher insert own record" ON public.teachers;
CREATE POLICY "Teacher insert own record" ON public.teachers
    FOR INSERT WITH CHECK (profile_id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_teachers_protected_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF public.is_trusted_backend() OR public.is_admin_or_verifier() THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.profile_verification_status NOT IN ('draft', 'submitted') THEN
            RAISE EXCEPTION 'Profil baharu hanya boleh berstatus draf atau dihantar.'
                USING ERRCODE = '42501';
        END IF;
        NEW.teacher_code := 'MSN-' || LPAD(nextval('public.teacher_msn_seq')::TEXT, 6, '0');
        NEW.is_published := FALSE;
        NEW.is_featured := FALSE;
        NEW.is_demo_record := FALSE;
        NEW.documents_reviewed_badge := FALSE;
        NEW.sanad_reviewed_badge := FALSE;
        NEW.published_at := NULL;
        NEW.archived_at := NULL;
        RETURN NEW;
    END IF;

    IF NEW.profile_id <> OLD.profile_id
       OR NEW.teacher_code <> OLD.teacher_code
       OR NEW.is_published IS DISTINCT FROM OLD.is_published
       OR NEW.is_featured IS DISTINCT FROM OLD.is_featured
       OR NEW.is_demo_record IS DISTINCT FROM OLD.is_demo_record
       OR NEW.documents_reviewed_badge IS DISTINCT FROM OLD.documents_reviewed_badge
       OR NEW.sanad_reviewed_badge IS DISTINCT FROM OLD.sanad_reviewed_badge
       OR NEW.published_at IS DISTINCT FROM OLD.published_at
       OR NEW.archived_at IS DISTINCT FROM OLD.archived_at THEN
        RAISE EXCEPTION 'Medan pengesahan dan penerbitan hanya boleh diubah oleh pentadbir.'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.owner_status_change_allowed(OLD.profile_verification_status, NEW.profile_verification_status) THEN
        RAISE EXCEPTION 'Peralihan status % -> % tidak dibenarkan untuk guru.',
            OLD.profile_verification_status, NEW.profile_verification_status
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_teachers ON public.teachers;
CREATE TRIGGER trg_guard_teachers
    BEFORE INSERT OR UPDATE ON public.teachers
    FOR EACH ROW EXECUTE FUNCTION public.guard_teachers_protected_columns();

-- -----------------------------------------------------------------------------
-- 5. Teacher education
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Read public teacher education" ON public.teacher_education;
CREATE POLICY "Read public teacher education" ON public.teacher_education
    FOR SELECT USING (
        (is_public = TRUE AND verification_status IN ('approved', 'published')
            AND public.is_teacher_public(teacher_id))
        OR public.owns_teacher(teacher_id)
        OR public.is_admin_or_verifier()
    );

CREATE OR REPLACE FUNCTION public.guard_owner_verification_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
-- Generic guard for tables with (teacher_id, verification_status).
BEGIN
    IF public.is_trusted_backend() OR public.is_admin_or_verifier() THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.verification_status NOT IN ('draft', 'submitted') THEN
            RAISE EXCEPTION 'Rekod baharu hanya boleh berstatus draf atau dihantar.'
                USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.teacher_id <> OLD.teacher_id THEN
        RAISE EXCEPTION 'Pemilik rekod tidak boleh diubah.' USING ERRCODE = '42501';
    END IF;

    IF NOT public.owner_status_change_allowed(OLD.verification_status, NEW.verification_status) THEN
        RAISE EXCEPTION 'Peralihan status % -> % tidak dibenarkan untuk guru.',
            OLD.verification_status, NEW.verification_status
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_teacher_education ON public.teacher_education;
CREATE TRIGGER trg_guard_teacher_education
    BEFORE INSERT OR UPDATE ON public.teacher_education
    FOR EACH ROW EXECUTE FUNCTION public.guard_owner_verification_status();

-- -----------------------------------------------------------------------------
-- 6. Ijazah records (RLS was enabled with no policies)
-- -----------------------------------------------------------------------------
CREATE POLICY "Read public ijazah records" ON public.ijazah_records
    FOR SELECT USING (
        (is_public = TRUE AND verification_status IN ('approved', 'published')
            AND public.is_teacher_public(teacher_id))
        OR public.owns_teacher(teacher_id)
        OR public.is_admin_or_verifier()
    );
CREATE POLICY "Teacher manage own ijazah records" ON public.ijazah_records
    FOR ALL USING (public.owns_teacher(teacher_id))
    WITH CHECK (public.owns_teacher(teacher_id));
CREATE POLICY "Admin manage ijazah records" ON public.ijazah_records
    FOR ALL USING (public.is_admin_or_verifier());

CREATE OR REPLACE FUNCTION public.guard_ijazah_records()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF public.is_trusted_backend() OR public.is_admin_or_verifier() THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'INSERT' THEN
        NEW.is_public := FALSE;
    ELSIF NEW.is_public IS DISTINCT FROM OLD.is_public THEN
        RAISE EXCEPTION 'Keterlihatan awam ijazah hanya boleh diubah oleh pentadbir.'
            USING ERRCODE = '42501';
    END IF;
    IF NEW.sanad_chain_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.sanad_chains sc
        WHERE sc.id = NEW.sanad_chain_id AND sc.teacher_id = NEW.teacher_id
    ) THEN
        RAISE EXCEPTION 'Rantaian sanad bukan milik guru ini.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_ijazah_status ON public.ijazah_records;
CREATE TRIGGER trg_guard_ijazah_status
    BEFORE INSERT OR UPDATE ON public.ijazah_records
    FOR EACH ROW EXECUTE FUNCTION public.guard_owner_verification_status();
DROP TRIGGER IF EXISTS trg_guard_ijazah_records ON public.ijazah_records;
CREATE TRIGGER trg_guard_ijazah_records
    BEFORE INSERT OR UPDATE ON public.ijazah_records
    FOR EACH ROW EXECUTE FUNCTION public.guard_ijazah_records();

-- -----------------------------------------------------------------------------
-- 7. Teacher public settings & public contact channels (no policies before)
-- -----------------------------------------------------------------------------
CREATE POLICY "Owner or admin read public settings" ON public.teacher_public_settings
    FOR SELECT USING (public.owns_teacher(teacher_id) OR public.is_admin_or_verifier());
CREATE POLICY "Owner manage public settings" ON public.teacher_public_settings
    FOR ALL USING (public.owns_teacher(teacher_id))
    WITH CHECK (public.owns_teacher(teacher_id));
CREATE POLICY "Admin manage public settings" ON public.teacher_public_settings
    FOR ALL USING (public.is_admin_or_verifier());

CREATE POLICY "Read approved public contact channels" ON public.public_contact_channels
    FOR SELECT USING (
        (is_public = TRUE AND is_approved = TRUE AND public.is_teacher_public(teacher_id))
        OR public.owns_teacher(teacher_id)
        OR public.is_admin_or_verifier()
    );
CREATE POLICY "Owner manage contact channels" ON public.public_contact_channels
    FOR ALL USING (public.owns_teacher(teacher_id))
    WITH CHECK (public.owns_teacher(teacher_id));
CREATE POLICY "Admin manage contact channels" ON public.public_contact_channels
    FOR ALL USING (public.is_admin_or_verifier());

CREATE OR REPLACE FUNCTION public.guard_contact_channels()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF public.is_trusted_backend() OR public.is_admin_or_verifier() THEN
        RETURN NEW;
    END IF;
    -- Any owner change (new channel or edited value) needs fresh admin approval.
    NEW.is_approved := FALSE;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_contact_channels ON public.public_contact_channels;
CREATE TRIGGER trg_guard_contact_channels
    BEFORE INSERT OR UPDATE ON public.public_contact_channels
    FOR EACH ROW EXECUTE FUNCTION public.guard_contact_channels();

-- -----------------------------------------------------------------------------
-- 8. Sanad chains, nodes, edges
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Read approved public sanad chains" ON public.sanad_chains;
CREATE POLICY "Owner or admin read sanad chains" ON public.sanad_chains
    FOR SELECT USING (public.owns_teacher(teacher_id) OR public.is_admin_or_verifier());

DROP POLICY IF EXISTS "Teacher manage own sanad chains" ON public.sanad_chains;
CREATE POLICY "Teacher manage own sanad chains" ON public.sanad_chains
    FOR ALL USING (public.owns_teacher(teacher_id))
    WITH CHECK (public.owns_teacher(teacher_id));
CREATE POLICY "Admin manage sanad chains" ON public.sanad_chains
    FOR ALL USING (public.is_admin_or_verifier());

CREATE OR REPLACE FUNCTION public.guard_sanad_chains()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF public.is_trusted_backend() OR public.is_admin_or_verifier() THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.verification_status NOT IN ('draft', 'submitted') THEN
            RAISE EXCEPTION 'Sanad baharu hanya boleh berstatus draf atau dihantar.'
                USING ERRCODE = '42501';
        END IF;
        NEW.sanad_code := 'SND-' || LPAD(nextval('public.sanad_code_seq')::TEXT, 6, '0');
        NEW.is_public := FALSE;
        NEW.is_demo_record := FALSE;
        NEW.internal_notes := NULL;
        NEW.verified_by := NULL;
        NEW.verified_at := NULL;
        RETURN NEW;
    END IF;

    IF NEW.teacher_id <> OLD.teacher_id
       OR NEW.sanad_code <> OLD.sanad_code
       OR NEW.is_public IS DISTINCT FROM OLD.is_public
       OR NEW.is_demo_record IS DISTINCT FROM OLD.is_demo_record
       OR NEW.internal_notes IS DISTINCT FROM OLD.internal_notes
       OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
       OR NEW.verified_at IS DISTINCT FROM OLD.verified_at THEN
        RAISE EXCEPTION 'Medan pengesahan sanad hanya boleh diubah oleh pentadbir.'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.owner_status_change_allowed(OLD.verification_status, NEW.verification_status) THEN
        RAISE EXCEPTION 'Peralihan status % -> % tidak dibenarkan untuk guru.',
            OLD.verification_status, NEW.verification_status
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_sanad_chains ON public.sanad_chains;
CREATE TRIGGER trg_guard_sanad_chains
    BEFORE INSERT OR UPDATE ON public.sanad_chains
    FOR EACH ROW EXECUTE FUNCTION public.guard_sanad_chains();

-- Nodes: creator must be the caller; owners may edit their own unreviewed nodes.
DROP POLICY IF EXISTS "Authenticated create draft sanad nodes" ON public.sanad_nodes;
CREATE POLICY "Authenticated create own sanad nodes" ON public.sanad_nodes
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL AND created_by = auth.uid());
CREATE POLICY "Creator update unreviewed sanad nodes" ON public.sanad_nodes
    FOR UPDATE USING (
        created_by = auth.uid()
        AND verification_status IN ('draft', 'submitted', 'revision_required')
    )
    WITH CHECK (created_by = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_sanad_nodes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF public.is_trusted_backend() OR public.is_admin_or_verifier() THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.verification_status NOT IN ('draft', 'submitted') THEN
            RAISE EXCEPTION 'Nod sanad baharu hanya boleh berstatus draf atau dihantar.'
                USING ERRCODE = '42501';
        END IF;
        NEW.created_by := auth.uid();
        NEW.is_public := FALSE;
        NEW.canonical_code := NULL;
        NEW.linked_teacher_id := NULL;
        RETURN NEW;
    END IF;

    IF NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.is_public IS DISTINCT FROM OLD.is_public
       OR NEW.canonical_code IS DISTINCT FROM OLD.canonical_code
       OR NEW.linked_teacher_id IS DISTINCT FROM OLD.linked_teacher_id THEN
        RAISE EXCEPTION 'Medan pengesahan nod sanad hanya boleh diubah oleh pentadbir.'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.owner_status_change_allowed(OLD.verification_status, NEW.verification_status) THEN
        RAISE EXCEPTION 'Peralihan status % -> % tidak dibenarkan untuk guru.',
            OLD.verification_status, NEW.verification_status
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_sanad_nodes ON public.sanad_nodes;
CREATE TRIGGER trg_guard_sanad_nodes
    BEFORE INSERT OR UPDATE ON public.sanad_nodes
    FOR EACH ROW EXECUTE FUNCTION public.guard_sanad_nodes();

-- Edges: public only when the edge AND its chain are public.
DROP POLICY IF EXISTS "Read approved public sanad edges" ON public.sanad_edges;
CREATE POLICY "Read approved public sanad edges" ON public.sanad_edges
    FOR SELECT USING (
        (is_public = TRUE AND verification_status IN ('approved', 'published')
            AND public.is_sanad_chain_public(sanad_chain_id))
        OR EXISTS (
            SELECT 1 FROM public.sanad_chains sc
            WHERE sc.id = sanad_chain_id AND public.owns_teacher(sc.teacher_id)
        )
        OR public.is_admin_or_verifier()
    );

DROP POLICY IF EXISTS "Teacher manage own sanad edges" ON public.sanad_edges;
CREATE POLICY "Teacher manage own sanad edges" ON public.sanad_edges
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.sanad_chains sc
            WHERE sc.id = sanad_chain_id AND public.owns_teacher(sc.teacher_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.sanad_chains sc
            WHERE sc.id = sanad_chain_id AND public.owns_teacher(sc.teacher_id)
        )
    );
CREATE POLICY "Admin manage sanad edges" ON public.sanad_edges
    FOR ALL USING (public.is_admin_or_verifier());

CREATE OR REPLACE FUNCTION public.guard_sanad_edges()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF public.is_trusted_backend() OR public.is_admin_or_verifier() THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.verification_status NOT IN ('draft', 'submitted') THEN
            RAISE EXCEPTION 'Hubungan sanad baharu hanya boleh berstatus draf atau dihantar.'
                USING ERRCODE = '42501';
        END IF;
        NEW.is_public := FALSE;
        RETURN NEW;
    END IF;

    IF NEW.sanad_chain_id <> OLD.sanad_chain_id
       OR NEW.is_public IS DISTINCT FROM OLD.is_public THEN
        RAISE EXCEPTION 'Medan pengesahan hubungan sanad hanya boleh diubah oleh pentadbir.'
            USING ERRCODE = '42501';
    END IF;

    IF NOT public.owner_status_change_allowed(OLD.verification_status, NEW.verification_status) THEN
        RAISE EXCEPTION 'Peralihan status % -> % tidak dibenarkan untuk guru.',
            OLD.verification_status, NEW.verification_status
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_sanad_edges ON public.sanad_edges;
CREATE TRIGGER trg_guard_sanad_edges
    BEFORE INSERT OR UPDATE ON public.sanad_edges
    FOR EACH ROW EXECUTE FUNCTION public.guard_sanad_edges();

CREATE INDEX IF NOT EXISTS idx_sanad_edges_source ON public.sanad_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_sanad_edges_target ON public.sanad_edges(target_node_id);
CREATE INDEX IF NOT EXISTS idx_sanad_nodes_name_trgm ON public.sanad_nodes USING gin (full_name_rumi gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_sanad_nodes_arabic_trgm ON public.sanad_nodes USING gin (full_name_arabic gin_trgm_ops);

-- -----------------------------------------------------------------------------
-- 9. Documents
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Teacher upload own documents" ON public.documents;
CREATE POLICY "Teacher upload own documents" ON public.documents
    FOR INSERT WITH CHECK (public.owns_teacher(teacher_id));

CREATE OR REPLACE FUNCTION public.guard_documents()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    -- Integrity (applies to everyone): linked records must belong to the same teacher.
    IF NEW.sanad_chain_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.sanad_chains sc
        WHERE sc.id = NEW.sanad_chain_id AND sc.teacher_id = NEW.teacher_id
    ) THEN
        RAISE EXCEPTION 'Rantaian sanad bukan milik guru ini.' USING ERRCODE = '42501';
    END IF;
    IF NEW.ijazah_record_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.ijazah_records ir
        WHERE ir.id = NEW.ijazah_record_id AND ir.teacher_id = NEW.teacher_id
    ) THEN
        RAISE EXCEPTION 'Rekod ijazah bukan milik guru ini.' USING ERRCODE = '42501';
    END IF;

    IF public.is_trusted_backend() OR public.is_admin_or_verifier() THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.storage_bucket <> 'private-ijazah-documents'
           OR NEW.storage_path NOT LIKE (auth.uid()::TEXT || '/%') THEN
            RAISE EXCEPTION 'Laluan storan dokumen tidak sah.' USING ERRCODE = '42501';
        END IF;
        NEW.review_status := 'submitted';
        NEW.reviewer_id := NULL;
        NEW.review_notes := NULL;
        NEW.reviewed_at := NULL;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_documents ON public.documents;
CREATE TRIGGER trg_guard_documents
    BEFORE INSERT OR UPDATE ON public.documents
    FOR EACH ROW EXECUTE FUNCTION public.guard_documents();

-- -----------------------------------------------------------------------------
-- 10. Verification submissions
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Teacher view own verification submissions" ON public.verification_submissions;
CREATE POLICY "Teacher view own verification submissions" ON public.verification_submissions
    FOR SELECT USING (public.owns_teacher(teacher_id) OR public.is_admin_or_verifier());

DROP POLICY IF EXISTS "Teacher submit verification" ON public.verification_submissions;
CREATE POLICY "Teacher submit verification" ON public.verification_submissions
    FOR INSERT WITH CHECK (submitted_by = auth.uid() AND public.owns_teacher(teacher_id));

CREATE OR REPLACE FUNCTION public.submission_target_belongs_to_teacher(
    p_teacher_id UUID,
    p_target_type TEXT,
    p_target_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT CASE p_target_type
        WHEN 'teacher_profile' THEN p_target_id = p_teacher_id
        WHEN 'ijazah_document' THEN EXISTS (
            SELECT 1 FROM public.documents d WHERE d.id = p_target_id AND d.teacher_id = p_teacher_id)
        WHEN 'sanad_chain' THEN EXISTS (
            SELECT 1 FROM public.sanad_chains sc WHERE sc.id = p_target_id AND sc.teacher_id = p_teacher_id)
        WHEN 'sanad_edge' THEN EXISTS (
            SELECT 1 FROM public.sanad_edges e
            JOIN public.sanad_chains sc ON sc.id = e.sanad_chain_id
            WHERE e.id = p_target_id AND sc.teacher_id = p_teacher_id)
        WHEN 'sanad_node' THEN EXISTS (
            SELECT 1 FROM public.sanad_nodes n
            JOIN public.teachers t ON t.profile_id = n.created_by
            WHERE n.id = p_target_id AND t.id = p_teacher_id)
        ELSE FALSE
    END;
$$;

CREATE OR REPLACE FUNCTION public.guard_verification_submissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NOT public.submission_target_belongs_to_teacher(NEW.teacher_id, NEW.target_type, NEW.target_record_id) THEN
        RAISE EXCEPTION 'Rekod sasaran semakan bukan milik guru ini.' USING ERRCODE = '42501';
    END IF;

    IF public.is_trusted_backend() OR public.is_admin_or_verifier() THEN
        RETURN NEW;
    END IF;

    -- Teachers can only create (never update) submissions; the policy has no teacher UPDATE.
    NEW.submission_code := 'SUB-' || LPAD(nextval('public.submission_code_seq')::TEXT, 6, '0');
    NEW.status := 'submitted';
    NEW.submitted_by := auth.uid();
    NEW.assigned_reviewer_id := NULL;
    NEW.decision_summary := NULL;
    NEW.decided_at := NULL;
    NEW.submitted_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_verification_submissions ON public.verification_submissions;
CREATE TRIGGER trg_guard_verification_submissions
    BEFORE INSERT OR UPDATE ON public.verification_submissions
    FOR EACH ROW EXECUTE FUNCTION public.guard_verification_submissions();

-- -----------------------------------------------------------------------------
-- 11. Storage policies
-- -----------------------------------------------------------------------------
-- Private bucket: objects live under "<auth.uid()>/..."; never public.
CREATE POLICY "Owner upload private documents" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'private-ijazah-documents'
        AND (storage.foldername(name))[1] = auth.uid()::TEXT
    );
CREATE POLICY "Owner or admin read private documents" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'private-ijazah-documents'
        AND ((storage.foldername(name))[1] = auth.uid()::TEXT OR public.is_admin_or_verifier())
    );
CREATE POLICY "Owner delete private documents" ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'private-ijazah-documents'
        AND (storage.foldername(name))[1] = auth.uid()::TEXT
    );

-- Profile photos: publicly served, owner-managed, images only, max 2 MB.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('teacher-photos', 'teacher-photos', TRUE, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = TRUE,
    file_size_limit = 2097152,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

CREATE POLICY "Owner upload teacher photo" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'teacher-photos' AND (storage.foldername(name))[1] = auth.uid()::TEXT);
CREATE POLICY "Owner update teacher photo" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'teacher-photos' AND (storage.foldername(name))[1] = auth.uid()::TEXT);
CREATE POLICY "Owner delete teacher photo" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'teacher-photos' AND (storage.foldername(name))[1] = auth.uid()::TEXT);

-- -----------------------------------------------------------------------------
-- 12. Audit logging (trigger based, append-only)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_old JSONB;
    v_new JSONB;
    v_actor UUID;
    v_redact TEXT[] := ARRAY['ic_number_encrypted', 'private_phone', 'residential_address'];
BEGIN
    IF TG_OP <> 'INSERT' THEN
        v_old := to_jsonb(OLD) - v_redact;
    END IF;
    IF TG_OP <> 'DELETE' THEN
        v_new := to_jsonb(NEW) - v_redact;
    END IF;

    SELECT p.id INTO v_actor FROM public.profiles p WHERE p.id = auth.uid();

    INSERT INTO public.audit_logs (actor_profile_id, actor_role, action, entity_table, entity_id, old_values, new_values)
    VALUES (
        v_actor,
        public.get_current_user_role(),
        TG_OP,
        TG_TABLE_NAME,
        COALESCE((v_new ->> 'id')::UUID, (v_old ->> 'id')::UUID),
        v_old,
        v_new
    );
    RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_row_change() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY[
        'profiles', 'teachers', 'teacher_education', 'institutions', 'sanad_chains',
        'sanad_nodes', 'sanad_edges', 'ijazah_records', 'documents',
        'verification_submissions', 'verification_reviews', 'public_contact_channels'
    ] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON public.%1$I', tbl);
        EXECUTE format(
            'CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
             FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()', tbl);
    END LOOP;
END $$;

-- Audit logs are append-only for every API role.
REVOKE UPDATE, DELETE, TRUNCATE ON public.audit_logs FROM anon, authenticated, service_role;

-- Application-level events (e.g. signed URL issued). Actor is always the caller.
CREATE OR REPLACE FUNCTION public.log_audit_event(
    p_action TEXT,
    p_entity_table TEXT,
    p_entity_id UUID DEFAULT NULL,
    p_details JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Pengesahan diperlukan.' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.audit_logs (actor_profile_id, actor_role, action, entity_table, entity_id, new_values)
    VALUES (auth.uid(), public.get_current_user_role(), 'APP:' || LEFT(p_action, 100),
            LEFT(p_entity_table, 80), p_entity_id, p_details);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_audit_event(TEXT, TEXT, UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit_event(TEXT, TEXT, UUID, JSONB) TO authenticated;

-- -----------------------------------------------------------------------------
-- 13. Rate limiting (server-side only, via service role)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limits (
    key TEXT PRIMARY KEY CHECK (char_length(key) <= 200),
    window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    hit_count INT NOT NULL DEFAULT 0 CHECK (hit_count >= 0)
);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
    p_key TEXT,
    p_max_hits INT,
    p_window_seconds INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INT;
BEGIN
    INSERT INTO public.rate_limits AS rl (key, window_start, hit_count)
    VALUES (p_key, NOW(), 1)
    ON CONFLICT (key) DO UPDATE SET
        hit_count = CASE
            WHEN rl.window_start < NOW() - make_interval(secs => p_window_seconds) THEN 1
            ELSE rl.hit_count + 1 END,
        window_start = CASE
            WHEN rl.window_start < NOW() - make_interval(secs => p_window_seconds) THEN NOW()
            ELSE rl.window_start END
    RETURNING hit_count INTO v_count;
    RETURN v_count <= p_max_hits;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INT, INT) TO service_role;

-- -----------------------------------------------------------------------------
-- 14. Public read views (owner-rights views; expose only safe columns)
-- -----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_public_teachers;
CREATE VIEW public.v_public_teachers WITH (security_barrier = true) AS
SELECT
    t.id,
    t.teacher_code,
    t.full_name_rumi,
    t.full_name_arabic,
    t.public_display_name,
    t.alternative_spellings,
    t.professional_title,
    t.teaching_state_id,
    ms.name AS state_name,
    ms.slug AS state_slug,
    t.teaching_district_id,
    md.name AS district_name,
    CASE WHEN COALESCE(tps.show_institution, TRUE) THEN t.primary_institution_id END AS institution_id,
    CASE WHEN COALESCE(tps.show_institution, TRUE) THEN i.name END AS institution_name,
    CASE WHEN COALESCE(tps.show_photo, TRUE) THEN t.photo_url END AS photo_url,
    t.short_bio,
    t.full_biography,
    t.teaching_experience_years,
    t.specializations,
    t.primary_qiraat_id,
    q.title_rumi AS primary_qiraat_rumi,
    t.primary_riwayat_id,
    r.full_label_rumi AS primary_riwayat_rumi,
    t.profile_verification_status,
    t.documents_reviewed_badge,
    t.sanad_reviewed_badge,
    t.is_featured,
    t.is_demo_record,
    t.published_at
FROM public.teachers t
JOIN public.profiles p ON p.id = t.profile_id AND p.is_active = TRUE
JOIN public.malaysian_states ms ON ms.id = t.teaching_state_id
LEFT JOIN public.malaysian_districts md ON md.id = t.teaching_district_id
LEFT JOIN public.institutions i ON i.id = t.primary_institution_id
LEFT JOIN public.qiraat_types q ON q.id = t.primary_qiraat_id
LEFT JOIN public.riwayat_types r ON r.id = t.primary_riwayat_id
LEFT JOIN public.teacher_public_settings tps ON tps.teacher_id = t.id
WHERE t.is_published = TRUE
  AND t.profile_verification_status = 'published'
  AND t.archived_at IS NULL;

CREATE OR REPLACE VIEW public.v_public_sanad_chains WITH (security_barrier = true) AS
SELECT
    sc.id,
    sc.teacher_id,
    sc.sanad_code,
    sc.title,
    sc.qiraat_id,
    sc.riwayat_id,
    sc.tariq_id,
    sc.transmission_method,
    sc.immediate_teacher_name_rumi,
    sc.immediate_teacher_name_arabic,
    CASE WHEN COALESCE(tps.show_ijazah_dates, TRUE) THEN sc.ijazah_date END AS ijazah_date,
    sc.ijazah_location,
    sc.institution_id,
    sc.generation_depth,
    sc.public_notes,
    sc.verification_status,
    sc.allow_public_graph_export,
    sc.is_demo_record,
    sc.verified_at
FROM public.sanad_chains sc
JOIN public.v_public_teachers vt ON vt.id = sc.teacher_id
LEFT JOIN public.teacher_public_settings tps ON tps.teacher_id = sc.teacher_id
WHERE sc.is_public = TRUE
  AND sc.verification_status IN ('approved', 'published');

REVOKE ALL ON public.v_public_teachers FROM anon, authenticated;
REVOKE ALL ON public.v_public_sanad_chains FROM anon, authenticated;
GRANT SELECT ON public.v_public_teachers TO anon, authenticated;
GRANT SELECT ON public.v_public_sanad_chains TO anon, authenticated;
