-- MySanad: migrations 005-011 combined, for a project that ALREADY has 001-004.
-- Generated 2026-11-14 from supabase/migrations/. Run ONCE in the Supabase SQL Editor.
-- Includes the security fixes from migration 005 (closes public access to promote_user_to_super_admin).

-- ========================================================================
-- FILE: supabase/migrations/005_security_hardening.sql
-- ========================================================================
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

-- ========================================================================
-- FILE: supabase/migrations/006_public_directory.sql
-- ========================================================================
-- =============================================================================
-- MySanad Migration 006: Public directory, search & public profile (Phase 2)
--
--   * normalize_search_text(): case-, diacritic- and spelling-tolerant matching
--     for Rumi and Arabic names (strips harakat/tatweel, unifies alef/ya/ta marbuta).
--   * teachers.search_document + trigram index, maintained by trigger.
--   * search_public_teachers(): the ONLY search entry point (published teachers only).
--   * v_public_state_stats / v_public_district_stats / v_public_institutions: real counts.
--   * public_platform_stats(): homepage statistics from real records.
--   * get_public_teacher_profile(): full public profile that honours the teacher's
--     visibility settings.
--   * Public base-table reads of education / ijazah / contacts are removed: those tables
--     hold fields a teacher may hide (dates, contacts) that RLS cannot mask per column.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Text normalisation
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_search_text(p_input TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
    SELECT btrim(
        regexp_replace(
            regexp_replace(
                translate(
                    -- Arabic: drop harakat (U+064B–U+065F), superscript alef (U+0670), tatweel (U+0640)
                    regexp_replace(lower(COALESCE(p_input, '')), '[ً-ٰٟـ]', '', 'g'),
                    -- alef variants -> alef, alef maqsura -> ya, ta marbuta -> ha; drop apostrophes
                    'أإآٱىة''’‘`ʼ',
                    'اااايه'
                ),
                '[-_.,/()]+', ' ', 'g'
            ),
            '\s+', ' ', 'g'
        )
    );
$$;

-- -----------------------------------------------------------------------------
-- 2. Search document on teachers
-- -----------------------------------------------------------------------------
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS search_document TEXT NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION public.teachers_set_search_document()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.search_document := public.normalize_search_text(concat_ws(' ',
        NEW.full_name_rumi,
        NEW.full_name_arabic,
        NEW.public_display_name,
        NEW.professional_title,
        array_to_string(COALESCE(NEW.alternative_spellings, '{}'), ' '),
        array_to_string(COALESCE(NEW.specializations, '{}'), ' ')
    ));
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_teachers_search_document ON public.teachers;
CREATE TRIGGER trg_teachers_search_document
    BEFORE INSERT OR UPDATE OF full_name_rumi, full_name_arabic, public_display_name,
        professional_title, alternative_spellings, specializations
    ON public.teachers
    FOR EACH ROW EXECUTE FUNCTION public.teachers_set_search_document();

-- Backfill existing rows (runs the trigger).
UPDATE public.teachers SET full_name_rumi = full_name_rumi;

CREATE INDEX IF NOT EXISTS idx_teachers_search_document_trgm
    ON public.teachers USING gin (search_document gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_teachers_published_at
    ON public.teachers (published_at DESC) WHERE is_published = TRUE;
CREATE INDEX IF NOT EXISTS idx_teachers_primary_institution ON public.teachers (primary_institution_id);
CREATE INDEX IF NOT EXISTS idx_sanad_chains_qiraat_riwayat ON public.sanad_chains (qiraat_id, riwayat_id);

-- -----------------------------------------------------------------------------
-- 3. Remove public base-table reads that cannot honour per-column privacy
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Read public teacher education" ON public.teacher_education;
CREATE POLICY "Owner or admin read teacher education" ON public.teacher_education
    FOR SELECT USING (public.owns_teacher(teacher_id) OR public.is_admin_or_verifier());

DROP POLICY IF EXISTS "Read public ijazah records" ON public.ijazah_records;
CREATE POLICY "Owner or admin read ijazah records" ON public.ijazah_records
    FOR SELECT USING (public.owns_teacher(teacher_id) OR public.is_admin_or_verifier());

DROP POLICY IF EXISTS "Read approved public contact channels" ON public.public_contact_channels;
CREATE POLICY "Owner or admin read contact channels" ON public.public_contact_channels
    FOR SELECT USING (public.owns_teacher(teacher_id) OR public.is_admin_or_verifier());

-- -----------------------------------------------------------------------------
-- 4. Aggregate views (real counts only)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_public_state_stats WITH (security_barrier = true) AS
SELECT
    ms.id,
    ms.code,
    ms.name,
    ms.slug,
    ms.is_federal_territory,
    ms.region,
    ms.display_order,
    COUNT(vt.id)::INT AS teacher_count
FROM public.malaysian_states ms
LEFT JOIN public.v_public_teachers vt ON vt.teaching_state_id = ms.id
GROUP BY ms.id;

CREATE OR REPLACE VIEW public.v_public_district_stats WITH (security_barrier = true) AS
SELECT
    md.id,
    md.state_id,
    md.name,
    md.slug,
    COUNT(vt.id)::INT AS teacher_count
FROM public.malaysian_districts md
LEFT JOIN public.v_public_teachers vt ON vt.teaching_district_id = md.id
WHERE md.is_active = TRUE
GROUP BY md.id;

CREATE OR REPLACE VIEW public.v_public_institutions WITH (security_barrier = true) AS
SELECT
    i.id,
    i.name,
    i.short_name,
    i.category,
    i.website_url,
    i.is_verified,
    ms.name AS state_name,
    ms.slug AS state_slug,
    md.name AS district_name,
    COUNT(vt.id)::INT AS teacher_count
FROM public.institutions i
LEFT JOIN public.malaysian_states ms ON ms.id = i.state_id
LEFT JOIN public.malaysian_districts md ON md.id = i.district_id
LEFT JOIN public.v_public_teachers vt ON vt.institution_id = i.id
WHERE i.is_archived = FALSE
GROUP BY i.id, ms.name, ms.slug, md.name
HAVING i.is_verified = TRUE OR COUNT(vt.id) > 0;

REVOKE ALL ON public.v_public_state_stats, public.v_public_district_stats, public.v_public_institutions
    FROM anon, authenticated;
GRANT SELECT ON public.v_public_state_stats, public.v_public_district_stats, public.v_public_institutions
    TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_platform_stats()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'teachers', (SELECT COUNT(*) FROM public.v_public_teachers),
        'demo_teachers', (SELECT COUNT(*) FROM public.v_public_teachers WHERE is_demo_record),
        'sanad_chains', (SELECT COUNT(*) FROM public.v_public_sanad_chains),
        'states_with_teachers', (SELECT COUNT(DISTINCT teaching_state_id) FROM public.v_public_teachers),
        'institutions', (SELECT COUNT(DISTINCT institution_id) FROM public.v_public_teachers WHERE institution_id IS NOT NULL)
    );
$$;

-- -----------------------------------------------------------------------------
-- 5. Search
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_public_teachers(
    p_query TEXT DEFAULT NULL,
    p_state_slug TEXT DEFAULT NULL,
    p_district_id UUID DEFAULT NULL,
    p_qiraat_id UUID DEFAULT NULL,
    p_riwayat_id UUID DEFAULT NULL,
    p_institution_id UUID DEFAULT NULL,
    p_limit INT DEFAULT 12,
    p_offset INT DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    teacher_code VARCHAR,
    public_display_name VARCHAR,
    full_name_arabic VARCHAR,
    professional_title VARCHAR,
    photo_url TEXT,
    state_name VARCHAR,
    state_slug VARCHAR,
    district_name VARCHAR,
    institution_id UUID,
    institution_name VARCHAR,
    specializations TEXT[],
    primary_qiraat_rumi VARCHAR,
    primary_riwayat_rumi VARCHAR,
    documents_reviewed_badge BOOLEAN,
    sanad_reviewed_badge BOOLEAN,
    is_featured BOOLEAN,
    is_demo_record BOOLEAN,
    published_at TIMESTAMPTZ,
    approved_sanad_count INT,
    relevance REAL,
    total_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH params AS (
        SELECT
            NULLIF(public.normalize_search_text(LEFT(p_query, 100)), '') AS q,
            LEAST(GREATEST(COALESCE(p_limit, 12), 1), 50) AS lim,
            GREATEST(COALESCE(p_offset, 0), 0) AS off
    ),
    matches AS (
        SELECT
            vt.*,
            (SELECT COUNT(*)::INT FROM public.v_public_sanad_chains c WHERE c.teacher_id = vt.id) AS approved_sanad_count,
            CASE
                WHEN p.q IS NULL THEN 0::REAL
                WHEN t.search_document LIKE p.q || '%' THEN 3::REAL
                WHEN t.search_document LIKE '%' || p.q || '%' THEN 2::REAL
                ELSE word_similarity(p.q, t.search_document)
            END AS relevance
        FROM public.v_public_teachers vt
        JOIN public.teachers t ON t.id = vt.id
        CROSS JOIN params p
        WHERE (p_state_slug IS NULL OR vt.state_slug = p_state_slug)
          AND (p_district_id IS NULL OR vt.teaching_district_id = p_district_id)
          AND (p_institution_id IS NULL OR vt.institution_id = p_institution_id)
          AND (p_qiraat_id IS NULL OR vt.primary_qiraat_id = p_qiraat_id OR EXISTS (
                SELECT 1 FROM public.v_public_sanad_chains c WHERE c.teacher_id = vt.id AND c.qiraat_id = p_qiraat_id))
          AND (p_riwayat_id IS NULL OR vt.primary_riwayat_id = p_riwayat_id OR EXISTS (
                SELECT 1 FROM public.v_public_sanad_chains c WHERE c.teacher_id = vt.id AND c.riwayat_id = p_riwayat_id))
          AND (
                p.q IS NULL
                OR t.search_document LIKE '%' || p.q || '%'
                OR public.normalize_search_text(concat_ws(' ',
                       vt.institution_name, vt.state_name, vt.district_name,
                       vt.primary_qiraat_rumi, vt.primary_riwayat_rumi)) LIKE '%' || p.q || '%'
                OR (char_length(p.q) >= 4 AND word_similarity(p.q, t.search_document) >= 0.5)
          )
    )
    SELECT
        m.id, m.teacher_code, m.public_display_name, m.full_name_arabic, m.professional_title,
        m.photo_url, m.state_name, m.state_slug, m.district_name, m.institution_id, m.institution_name,
        m.specializations, m.primary_qiraat_rumi, m.primary_riwayat_rumi,
        m.documents_reviewed_badge, m.sanad_reviewed_badge, m.is_featured, m.is_demo_record,
        m.published_at, m.approved_sanad_count, m.relevance,
        COUNT(*) OVER () AS total_count
    FROM matches m
    ORDER BY m.relevance DESC, m.is_featured DESC, m.published_at DESC NULLS LAST, m.public_display_name ASC
    LIMIT (SELECT lim FROM params)
    OFFSET (SELECT off FROM params);
$$;

-- -----------------------------------------------------------------------------
-- 6. Public profile (honours visibility settings)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_teacher_profile(p_teacher_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'teacher', to_jsonb(vt) - 'teaching_state_id' - 'teaching_district_id',
        'settings', jsonb_build_object(
            'accepting_students', COALESCE(tps.accepting_students, TRUE),
            'show_sanad_graph', COALESCE(tps.show_sanad_graph, TRUE),
            'allow_graph_download', COALESCE(tps.allow_graph_download, FALSE)
        ),
        'institution', (
            SELECT jsonb_build_object(
                'id', i.id, 'name', i.name, 'short_name', i.short_name, 'category', i.category,
                'website_url', i.website_url, 'is_verified', i.is_verified,
                'state_name', ms.name, 'district_name', md.name)
            FROM public.institutions i
            LEFT JOIN public.malaysian_states ms ON ms.id = i.state_id
            LEFT JOIN public.malaysian_districts md ON md.id = i.district_id
            WHERE i.id = vt.institution_id AND i.is_archived = FALSE
        ),
        'education', CASE WHEN COALESCE(tps.show_education, TRUE) THEN COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', e.id, 'institution_name', e.institution_name, 'country', e.country,
                'qualification_level', e.qualification_level, 'field_of_study', e.field_of_study,
                'graduation_year', e.graduation_year)
                ORDER BY e.graduation_year DESC NULLS LAST)
            FROM public.teacher_education e
            WHERE e.teacher_id = vt.id AND e.is_public AND e.verification_status IN ('approved', 'published')
        ), '[]'::jsonb) ELSE '[]'::jsonb END,
        'ijazah', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', ir.id, 'ijazah_title', ir.ijazah_title,
                'granting_sheikh_rumi', ir.granting_sheikh_rumi, 'granting_sheikh_arabic', ir.granting_sheikh_arabic,
                'granting_institution', ir.granting_institution,
                'qiraat', q.title_rumi, 'riwayat', r.full_label_rumi, 'tariq', tt.name_rumi,
                'conferral_date', CASE WHEN COALESCE(tps.show_ijazah_dates, TRUE) AND ir.show_date_publicly
                                       THEN ir.conferral_date END,
                'conferral_place', ir.conferral_place)
                ORDER BY ir.conferral_date DESC NULLS LAST)
            FROM public.ijazah_records ir
            LEFT JOIN public.qiraat_types q ON q.id = ir.qiraat_id
            LEFT JOIN public.riwayat_types r ON r.id = ir.riwayat_id
            LEFT JOIN public.tariq_types tt ON tt.id = ir.tariq_id
            WHERE ir.teacher_id = vt.id AND ir.is_public AND ir.verification_status IN ('approved', 'published')
        ), '[]'::jsonb),
        'sanad_chains', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', c.id, 'sanad_code', c.sanad_code, 'title', c.title,
                'qiraat', q.title_rumi, 'qiraat_arabic', q.title_arabic,
                'riwayat', r.full_label_rumi, 'riwayat_arabic', r.full_label_arabic,
                'tariq', tt.name_rumi,
                'transmission_method', c.transmission_method,
                'immediate_teacher_name_rumi', c.immediate_teacher_name_rumi,
                'immediate_teacher_name_arabic', c.immediate_teacher_name_arabic,
                'ijazah_date', c.ijazah_date, 'ijazah_location', c.ijazah_location,
                'generation_depth', c.generation_depth, 'public_notes', c.public_notes,
                'verification_status', c.verification_status, 'verified_at', c.verified_at,
                'is_demo_record', c.is_demo_record)
                ORDER BY c.verified_at DESC NULLS LAST)
            FROM public.v_public_sanad_chains c
            JOIN public.qiraat_types q ON q.id = c.qiraat_id
            JOIN public.riwayat_types r ON r.id = c.riwayat_id
            LEFT JOIN public.tariq_types tt ON tt.id = c.tariq_id
            WHERE c.teacher_id = vt.id
        ), '[]'::jsonb),
        'contacts', CASE WHEN COALESCE(tps.show_public_contact, TRUE) THEN COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', pc.id, 'channel_type', pc.channel_type, 'label', pc.label, 'contact_value', pc.contact_value)
                ORDER BY pc.channel_type)
            FROM public.public_contact_channels pc
            WHERE pc.teacher_id = vt.id AND pc.is_public AND pc.is_approved
        ), '[]'::jsonb) ELSE '[]'::jsonb END
    )
    FROM public.v_public_teachers vt
    LEFT JOIN public.teacher_public_settings tps ON tps.teacher_id = vt.id
    WHERE vt.id = p_teacher_id;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_search_text(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_platform_stats() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_public_teachers(TEXT, TEXT, UUID, UUID, UUID, UUID, INT, INT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_teacher_profile(UUID) TO anon, authenticated;

-- ========================================================================
-- FILE: supabase/migrations/007_teacher_portal.sql
-- ========================================================================
-- =============================================================================
-- MySanad Migration 007: Teacher portal (Phase 3)
--
--   * updated_at maintained automatically on every table that has it.
--   * Teacher profile status can no longer be changed directly by the teacher;
--     submission and withdrawal go through submit_my_teacher_profile() /
--     withdraw_my_teacher_submission(), which are atomic and create/close the
--     verification_submissions row.
--   * Content lock: a profile that is under review / approved / published / rejected /
--     suspended cannot be edited directly. Edits to a published profile go to
--     teacher_change_requests and are applied by an administrator (Phase 6).
--     Private contact fields (phone, residential address) stay editable.
--   * Owner edits to an approved/published education or ijazah row send that row back
--     to 'submitted' (hidden publicly until re-approved).
--   * Teachers may add unverified institutions (deduplicated by normalised name + state).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. updated_at
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOR tbl IN
        SELECT c.table_name FROM information_schema.columns c
        JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema = 'public' AND c.column_name = 'updated_at' AND t.table_type = 'BASE TABLE'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_zz_set_updated_at ON public.%I', tbl);
        EXECUTE format(
            'CREATE TRIGGER trg_zz_set_updated_at BEFORE UPDATE ON public.%I
             FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', tbl);
    END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Helpers
-- -----------------------------------------------------------------------------
-- Teaching location is collected in wizard step 5; required at submission instead of at creation.
ALTER TABLE public.teachers ALTER COLUMN teaching_state_id DROP NOT NULL;

ALTER TABLE public.teachers
    ADD COLUMN IF NOT EXISTS onboarding_step SMALLINT NOT NULL DEFAULT 2
        CHECK (onboarding_step BETWEEN 2 AND 7);

-- Columns that are bookkeeping or private (not reviewed) and may change on a locked profile.
CREATE OR REPLACE FUNCTION public.teacher_unreviewed_columns()
RETURNS TEXT[]
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT ARRAY[
        'updated_at', 'search_document', 'onboarding_step', 'profile_verification_status',
        'private_phone', 'residential_address', 'residential_state_id', 'residential_district_id'
    ];
$$;

CREATE OR REPLACE FUNCTION public.jsonb_keys_subset(p_doc JSONB, p_allowed TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT jsonb_typeof(p_doc) = 'object'
       AND NOT EXISTS (SELECT 1 FROM jsonb_object_keys(p_doc) k WHERE k <> ALL (p_allowed));
$$;

-- -----------------------------------------------------------------------------
-- 3. Teachers guard (replaces the Phase 1 version)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_teachers_protected_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_skip TEXT[] := public.teacher_unreviewed_columns();
BEGIN
    IF public.is_trusted_backend() OR public.is_admin_or_verifier() THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.profile_verification_status <> 'draft' THEN
            RAISE EXCEPTION 'Profil baharu mesti bermula sebagai draf.' USING ERRCODE = '42501';
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

    IF NEW.profile_verification_status IS DISTINCT FROM OLD.profile_verification_status THEN
        RAISE EXCEPTION 'Status profil hanya berubah melalui penghantaran rasmi atau keputusan pentadbir.'
            USING ERRCODE = '42501';
    END IF;

    IF OLD.profile_verification_status NOT IN ('draft', 'submitted', 'revision_required')
       AND (to_jsonb(NEW) - v_skip) IS DISTINCT FROM (to_jsonb(OLD) - v_skip) THEN
        RAISE EXCEPTION 'Profil ini sedang atau telah disemak. Hantar permohonan perubahan untuk menyunting maklumat awam.'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Education / ijazah guard (replaces the Phase 1 version)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_owner_verification_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_skip TEXT[] := ARRAY['verification_status', 'updated_at', 'is_public', 'show_date_publicly'];
    v_changed BOOLEAN;
BEGIN
    IF public.is_trusted_backend() OR public.is_admin_or_verifier() THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.verification_status NOT IN ('draft', 'submitted') THEN
            RAISE EXCEPTION 'Rekod baharu hanya boleh berstatus draf atau dihantar.' USING ERRCODE = '42501';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.teacher_id <> OLD.teacher_id THEN
        RAISE EXCEPTION 'Pemilik rekod tidak boleh diubah.' USING ERRCODE = '42501';
    END IF;

    v_changed := (to_jsonb(NEW) - v_skip) IS DISTINCT FROM (to_jsonb(OLD) - v_skip);

    IF v_changed AND OLD.verification_status IN ('under_review', 'rejected', 'suspended') THEN
        RAISE EXCEPTION 'Rekod ini sedang disemak atau telah dimuktamadkan dan tidak boleh disunting.'
            USING ERRCODE = '42501';
    END IF;

    IF v_changed AND OLD.verification_status IN ('approved', 'published') THEN
        -- Edited verified content goes back for review and is hidden publicly until re-approved.
        NEW.verification_status := 'submitted';
        RETURN NEW;
    END IF;

    IF NOT public.owner_status_change_allowed(OLD.verification_status, NEW.verification_status) THEN
        RAISE EXCEPTION 'Peralihan status % -> % tidak dibenarkan untuk guru.',
            OLD.verification_status, NEW.verification_status USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Submission & withdrawal (atomic, validated)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_my_teacher_profile(p_notes TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    t public.teachers%ROWTYPE;
    v_missing TEXT[] := '{}';
    v_submission UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Log masuk diperlukan.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO t FROM public.teachers WHERE profile_id = auth.uid() FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profil guru belum dicipta.' USING ERRCODE = 'P0002';
    END IF;
    IF t.profile_verification_status NOT IN ('draft', 'revision_required') THEN
        RAISE EXCEPTION 'Profil berstatus % tidak boleh dihantar.', t.profile_verification_status
            USING ERRCODE = '42501';
    END IF;

    IF COALESCE(btrim(t.full_name_rumi), '') = '' THEN v_missing := v_missing || 'nama penuh'::TEXT; END IF;
    IF COALESCE(btrim(t.public_display_name), '') = '' THEN v_missing := v_missing || 'nama paparan'::TEXT; END IF;
    IF t.teaching_state_id IS NULL THEN v_missing := v_missing || 'negeri mengajar'::TEXT; END IF;
    IF t.primary_qiraat_id IS NULL THEN v_missing := v_missing || 'qiraat utama'::TEXT; END IF;
    IF char_length(COALESCE(t.short_bio, '')) < 30 THEN v_missing := v_missing || 'biografi ringkas'::TEXT; END IF;
    IF array_length(v_missing, 1) > 0 THEN
        RAISE EXCEPTION 'Maklumat belum lengkap: %.', array_to_string(v_missing, ', ') USING ERRCODE = '22023';
    END IF;

    UPDATE public.teachers SET profile_verification_status = 'submitted', onboarding_step = 7 WHERE id = t.id;
    UPDATE public.teacher_education SET verification_status = 'submitted'
        WHERE teacher_id = t.id AND verification_status = 'draft';
    UPDATE public.ijazah_records SET verification_status = 'submitted'
        WHERE teacher_id = t.id AND verification_status = 'draft';
    INSERT INTO public.teacher_public_settings (teacher_id) VALUES (t.id) ON CONFLICT (teacher_id) DO NOTHING;

    INSERT INTO public.verification_submissions (teacher_id, target_type, target_record_id, submitted_by, applicant_notes)
    VALUES (t.id, 'teacher_profile', t.id, auth.uid(), LEFT(NULLIF(btrim(p_notes), ''), 1000))
    RETURNING id INTO v_submission;

    RETURN v_submission;
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_my_teacher_submission()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    t public.teachers%ROWTYPE;
BEGIN
    SELECT * INTO t FROM public.teachers WHERE profile_id = auth.uid() FOR UPDATE;
    IF NOT FOUND OR t.profile_verification_status <> 'submitted' THEN
        RAISE EXCEPTION 'Hanya profil yang dihantar dan belum disemak boleh ditarik balik.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.teachers SET profile_verification_status = 'draft' WHERE id = t.id;
    UPDATE public.verification_submissions
        SET status = 'draft', decision_summary = 'Ditarik balik oleh guru.', decided_at = NOW()
        WHERE teacher_id = t.id AND target_type = 'teacher_profile' AND status = 'submitted';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_my_teacher_profile(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.withdraw_my_teacher_submission() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_my_teacher_profile(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_my_teacher_submission() TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. Change requests for published profiles
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.teacher_change_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
    proposed_changes JSONB NOT NULL CHECK (
        proposed_changes <> '{}'::jsonb
        AND public.jsonb_keys_subset(proposed_changes, ARRAY[
            'full_name_rumi', 'full_name_arabic', 'public_display_name', 'alternative_spellings',
            'professional_title', 'gender', 'teaching_state_id', 'teaching_district_id',
            'primary_institution_id', 'photo_url', 'short_bio', 'full_biography',
            'teaching_experience_years', 'specializations', 'primary_qiraat_id', 'primary_riwayat_id'
        ])
    ),
    applicant_notes TEXT CHECK (char_length(applicant_notes) <= 1000),
    status verification_status NOT NULL DEFAULT 'submitted',
    submitted_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reviewer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    decision_summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_teacher_change_requests_open
    ON public.teacher_change_requests (teacher_id) WHERE status IN ('submitted', 'under_review');

ALTER TABLE public.teacher_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or admin read change requests" ON public.teacher_change_requests
    FOR SELECT USING (public.owns_teacher(teacher_id) OR public.is_admin_or_verifier());
CREATE POLICY "Owner create change requests" ON public.teacher_change_requests
    FOR INSERT WITH CHECK (public.owns_teacher(teacher_id) AND submitted_by = auth.uid());
CREATE POLICY "Owner cancel open change requests" ON public.teacher_change_requests
    FOR DELETE USING (public.owns_teacher(teacher_id) AND status = 'submitted');
CREATE POLICY "Admin manage change requests" ON public.teacher_change_requests
    FOR ALL USING (public.is_admin_or_verifier());

CREATE OR REPLACE FUNCTION public.guard_teacher_change_requests()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF public.is_trusted_backend() OR public.is_admin_or_verifier() THEN
        RETURN NEW;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.teachers t
        WHERE t.id = NEW.teacher_id AND t.profile_verification_status IN ('approved', 'published')
    ) THEN
        RAISE EXCEPTION 'Permohonan perubahan hanya untuk profil yang telah diluluskan atau diterbitkan.'
            USING ERRCODE = '42501';
    END IF;
    NEW.status := 'submitted';
    NEW.reviewer_id := NULL;
    NEW.decision_summary := NULL;
    NEW.decided_at := NULL;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_teacher_change_requests ON public.teacher_change_requests;
CREATE TRIGGER trg_guard_teacher_change_requests
    BEFORE INSERT ON public.teacher_change_requests
    FOR EACH ROW EXECUTE FUNCTION public.guard_teacher_change_requests();

DROP TRIGGER IF EXISTS trg_audit_teacher_change_requests ON public.teacher_change_requests;
CREATE TRIGGER trg_audit_teacher_change_requests
    AFTER INSERT OR UPDATE OR DELETE ON public.teacher_change_requests
    FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_zz_set_updated_at ON public.teacher_change_requests;
CREATE TRIGGER trg_zz_set_updated_at BEFORE UPDATE ON public.teacher_change_requests
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 7. Teacher-proposed institutions
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_institutions_normalized_name_state
    ON public.institutions (public.normalize_search_text(name), state_id);

CREATE POLICY "Authenticated propose institutions" ON public.institutions
    FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.guard_institutions()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF public.is_trusted_backend() OR public.is_admin_or_verifier() THEN
        RETURN NEW;
    END IF;
    NEW.is_verified := FALSE;
    NEW.is_archived := FALSE;
    NEW.name := btrim(regexp_replace(NEW.name, '\s+', ' ', 'g'));
    IF char_length(NEW.name) < 3 THEN
        RAISE EXCEPTION 'Nama institusi terlalu pendek.' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_institutions ON public.institutions;
CREATE TRIGGER trg_guard_institutions
    BEFORE INSERT ON public.institutions
    FOR EACH ROW EXECUTE FUNCTION public.guard_institutions();

-- -----------------------------------------------------------------------------
-- 8. Storage: owners can read their own photo objects (needed by download/remove).
-- -----------------------------------------------------------------------------
CREATE POLICY "Owner read teacher photo objects" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'teacher-photos' AND (storage.foldername(name))[1] = auth.uid()::TEXT);

-- ========================================================================
-- FILE: supabase/migrations/008_sanad_management.sql
-- ========================================================================
-- =============================================================================
-- MySanad Migration 008: Sanad management & graph (Phase 4)
--
-- Conventions
--   * Edge direction: source_node_id = the transmitting teacher (shaykh),
--     target_node_id = the receiving student. A chain flows "down" to the teacher.
--   * Each teacher has one transmitter node linked to their profile (linked_teacher_id),
--     created with ensure_my_sanad_node(). Every chain must lead to that node.
--   * Nodes are shared. Teachers may link only nodes they can see (approved public
--     nodes or nodes they created). Similar names are NEVER merged automatically.
--
-- Rules
--   * Chain status changes only through submit/withdraw functions or administrators.
--   * A chain and its edges are editable only while 'draft' or 'revision_required'.
--   * Approved/published chains are revised by creating a superseding draft copy;
--     the public keeps seeing the approved version until the revision is approved.
--   * Every submission stores a snapshot in sanad_chain_revisions.
--   * Edges: no cycles within a chain, no duplicates.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Schema additions
-- -----------------------------------------------------------------------------
ALTER TABLE public.sanad_edges
    ADD COLUMN IF NOT EXISTS transmission_date_text VARCHAR(100),
    ADD COLUMN IF NOT EXISTS transmission_location VARCHAR(200),
    ADD COLUMN IF NOT EXISTS notes TEXT CHECK (char_length(notes) <= 2000);

ALTER TABLE public.sanad_chains
    ADD COLUMN IF NOT EXISTS supersedes_chain_id UUID REFERENCES public.sanad_chains(id) ON DELETE SET NULL;

-- Filled in at submission from the graph; not required while drafting.
ALTER TABLE public.sanad_chains ALTER COLUMN immediate_teacher_name_rumi DROP NOT NULL;
ALTER TABLE public.sanad_chains ALTER COLUMN generation_depth DROP DEFAULT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sanad_edges_chain_pair
    ON public.sanad_edges (sanad_chain_id, source_node_id, target_node_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sanad_nodes_linked_teacher
    ON public.sanad_nodes (linked_teacher_id) WHERE linked_teacher_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sanad_chains_open_revision
    ON public.sanad_chains (supersedes_chain_id)
    WHERE supersedes_chain_id IS NOT NULL AND verification_status IN ('draft', 'submitted', 'under_review', 'revision_required');
CREATE INDEX IF NOT EXISTS idx_sanad_nodes_created_by ON public.sanad_nodes (created_by);

CREATE TABLE IF NOT EXISTS public.sanad_chain_revisions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sanad_chain_id UUID NOT NULL REFERENCES public.sanad_chains(id) ON DELETE CASCADE,
    revision_no INT NOT NULL CHECK (revision_no > 0),
    reason VARCHAR(60) NOT NULL,
    snapshot JSONB NOT NULL,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (sanad_chain_id, revision_no)
);
ALTER TABLE public.sanad_chain_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner or admin read chain revisions" ON public.sanad_chain_revisions
    FOR SELECT USING (
        public.is_admin_or_verifier()
        OR EXISTS (SELECT 1 FROM public.sanad_chains sc WHERE sc.id = sanad_chain_id AND public.owns_teacher(sc.teacher_id))
    );
-- No insert/update/delete policies: written only by SECURITY DEFINER functions.

-- -----------------------------------------------------------------------------
-- 2. Helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sanad_chain_editable_status(p_status verification_status)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
    SELECT p_status IN ('draft', 'revision_required');
$$;

-- Node the caller may use in their own edges.
CREATE OR REPLACE FUNCTION public.can_use_sanad_node(p_node_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.sanad_nodes n
        WHERE n.id = p_node_id
          AND (
              (n.is_public AND n.verification_status IN ('approved', 'published'))
              OR n.created_by = auth.uid()
              OR (n.linked_teacher_id IS NOT NULL AND public.owns_teacher(n.linked_teacher_id))
          )
    );
$$;

-- -----------------------------------------------------------------------------
-- 3. Guards (replace Phase 1 versions)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_sanad_chains()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_skip TEXT[] := ARRAY['updated_at', 'verification_status', 'generation_depth', 'immediate_teacher_name_rumi',
                           'immediate_teacher_name_arabic'];
BEGIN
    IF public.is_trusted_backend() OR public.is_admin_or_verifier() THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF NOT public.sanad_chain_editable_status(OLD.verification_status) THEN
            RAISE EXCEPTION 'Rantaian yang dihantar atau telah disemak tidak boleh dipadam.' USING ERRCODE = '42501';
        END IF;
        RETURN OLD;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.verification_status <> 'draft' THEN
            RAISE EXCEPTION 'Rantaian baharu mesti bermula sebagai draf.' USING ERRCODE = '42501';
        END IF;
        NEW.sanad_code := 'SND-' || LPAD(nextval('public.sanad_code_seq')::TEXT, 6, '0');
        NEW.is_public := FALSE;
        NEW.is_demo_record := FALSE;
        NEW.internal_notes := NULL;
        NEW.verified_by := NULL;
        NEW.verified_at := NULL;
        NEW.supersedes_chain_id := NULL;
        RETURN NEW;
    END IF;

    IF NEW.teacher_id <> OLD.teacher_id
       OR NEW.sanad_code <> OLD.sanad_code
       OR NEW.is_public IS DISTINCT FROM OLD.is_public
       OR NEW.is_demo_record IS DISTINCT FROM OLD.is_demo_record
       OR NEW.internal_notes IS DISTINCT FROM OLD.internal_notes
       OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
       OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
       OR NEW.supersedes_chain_id IS DISTINCT FROM OLD.supersedes_chain_id THEN
        RAISE EXCEPTION 'Medan pengesahan sanad hanya boleh diubah oleh pentadbir.' USING ERRCODE = '42501';
    END IF;
    IF NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
        RAISE EXCEPTION 'Status sanad hanya berubah melalui penghantaran rasmi atau keputusan pentadbir.' USING ERRCODE = '42501';
    END IF;
    IF NOT public.sanad_chain_editable_status(OLD.verification_status)
       AND (to_jsonb(NEW) - v_skip) IS DISTINCT FROM (to_jsonb(OLD) - v_skip) THEN
        RAISE EXCEPTION 'Rantaian ini telah dihantar atau disemak. Tarik balik atau cipta semakan baharu untuk menyunting.'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_sanad_chains ON public.sanad_chains;
CREATE TRIGGER trg_guard_sanad_chains
    BEFORE INSERT OR UPDATE OR DELETE ON public.sanad_chains
    FOR EACH ROW EXECUTE FUNCTION public.guard_sanad_chains();

CREATE OR REPLACE FUNCTION public.guard_sanad_edges()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_chain UUID := COALESCE(NEW.sanad_chain_id, OLD.sanad_chain_id);
    v_status verification_status;
BEGIN
    IF TG_OP <> 'DELETE' THEN
        -- Integrity for everyone: the new edge must not close a cycle within its chain.
        IF EXISTS (
            WITH RECURSIVE down(node_id) AS (
                SELECT NEW.target_node_id
                UNION
                SELECT e.target_node_id FROM public.sanad_edges e
                JOIN down d ON e.source_node_id = d.node_id
                WHERE e.sanad_chain_id = NEW.sanad_chain_id AND e.id <> NEW.id
            )
            SELECT 1 FROM down WHERE node_id = NEW.source_node_id
        ) THEN
            RAISE EXCEPTION 'Hubungan ini akan membentuk kitaran dalam rantaian sanad.' USING ERRCODE = '22023';
        END IF;
    END IF;

    IF public.is_trusted_backend() OR public.is_admin_or_verifier() THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    SELECT verification_status INTO v_status FROM public.sanad_chains WHERE id = v_chain;
    IF v_status IS NOT NULL AND NOT public.sanad_chain_editable_status(v_status) THEN
        RAISE EXCEPTION 'Rantaian ini telah dihantar atau disemak dan tidak boleh disunting.' USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    IF NOT public.can_use_sanad_node(NEW.source_node_id) OR NOT public.can_use_sanad_node(NEW.target_node_id) THEN
        RAISE EXCEPTION 'Perawi yang dipilih tidak boleh digunakan.' USING ERRCODE = '42501';
    END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.verification_status := 'draft';
        NEW.is_public := FALSE;
        RETURN NEW;
    END IF;

    IF NEW.sanad_chain_id <> OLD.sanad_chain_id
       OR NEW.is_public IS DISTINCT FROM OLD.is_public
       OR NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
        RAISE EXCEPTION 'Medan pengesahan hubungan sanad hanya boleh diubah oleh pentadbir.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_sanad_edges ON public.sanad_edges;
CREATE TRIGGER trg_guard_sanad_edges
    BEFORE INSERT OR UPDATE OR DELETE ON public.sanad_edges
    FOR EACH ROW EXECUTE FUNCTION public.guard_sanad_edges();

CREATE OR REPLACE FUNCTION public.guard_sanad_nodes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_skip TEXT[] := ARRAY['updated_at', 'verification_status'];
BEGIN
    IF public.is_trusted_backend() OR public.is_admin_or_verifier() THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.verification_status := 'draft';
        NEW.created_by := auth.uid();
        NEW.is_public := FALSE;
        NEW.canonical_code := NULL;
        NEW.linked_teacher_id := NULL;
        RETURN NEW;
    END IF;

    IF NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.is_public IS DISTINCT FROM OLD.is_public
       OR NEW.canonical_code IS DISTINCT FROM OLD.canonical_code
       OR NEW.linked_teacher_id IS DISTINCT FROM OLD.linked_teacher_id
       OR NEW.verification_status IS DISTINCT FROM OLD.verification_status THEN
        RAISE EXCEPTION 'Medan pengesahan nod sanad hanya boleh diubah oleh pentadbir.' USING ERRCODE = '42501';
    END IF;
    IF OLD.verification_status NOT IN ('draft', 'revision_required')
       AND (to_jsonb(NEW) - v_skip) IS DISTINCT FROM (to_jsonb(OLD) - v_skip) THEN
        RAISE EXCEPTION 'Maklumat perawi ini sedang atau telah disemak dan tidak boleh disunting.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Teacher self-node
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_my_sanad_node()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    t public.teachers%ROWTYPE;
    v_node UUID;
BEGIN
    SELECT * INTO t FROM public.teachers WHERE profile_id = auth.uid();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profil guru belum dicipta.' USING ERRCODE = 'P0002';
    END IF;
    SELECT id INTO v_node FROM public.sanad_nodes WHERE linked_teacher_id = t.id;
    IF v_node IS NULL THEN
        INSERT INTO public.sanad_nodes (full_name_rumi, full_name_arabic, alternative_spellings, historical_title,
            generation_category, country_or_region, linked_teacher_id, created_by, verification_status, is_public)
        VALUES (t.full_name_rumi, COALESCE(t.full_name_arabic, ''), COALESCE(t.alternative_spellings, '{}'),
            t.professional_title, 'Guru Nusantara / Semasa', 'Malaysia', t.id, auth.uid(), 'draft', FALSE)
        RETURNING id INTO v_node;
    END IF;
    RETURN v_node;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Snapshot, submit, withdraw, revise
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sanad_chain_snapshot(p_chain_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'chain', to_jsonb(sc) - 'internal_notes',
        'edges', COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.sequence_order, e.created_at)
                           FROM public.sanad_edges e WHERE e.sanad_chain_id = sc.id), '[]'::jsonb),
        'nodes', COALESCE((SELECT jsonb_agg(to_jsonb(n) ORDER BY n.full_name_rumi)
                           FROM public.sanad_nodes n
                           WHERE n.id IN (SELECT source_node_id FROM public.sanad_edges WHERE sanad_chain_id = sc.id
                                          UNION SELECT target_node_id FROM public.sanad_edges WHERE sanad_chain_id = sc.id)),
                          '[]'::jsonb)
    )
    FROM public.sanad_chains sc WHERE sc.id = p_chain_id;
$$;
REVOKE EXECUTE ON FUNCTION public.sanad_chain_snapshot(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_sanad_chain_revision(p_chain_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    INSERT INTO public.sanad_chain_revisions (sanad_chain_id, revision_no, reason, snapshot, created_by)
    SELECT p_chain_id,
           COALESCE((SELECT MAX(revision_no) FROM public.sanad_chain_revisions WHERE sanad_chain_id = p_chain_id), 0) + 1,
           LEFT(p_reason, 60),
           public.sanad_chain_snapshot(p_chain_id),
           auth.uid();
$$;
REVOKE EXECUTE ON FUNCTION public.record_sanad_chain_revision(UUID, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_my_sanad_chain(p_chain_id UUID, p_notes TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    c public.sanad_chains%ROWTYPE;
    v_self UUID;
    v_nodes INT;
    v_reaching INT;
    v_depth INT;
    v_direct RECORD;
    v_submission UUID;
BEGIN
    SELECT sc.* INTO c FROM public.sanad_chains sc
    JOIN public.teachers t ON t.id = sc.teacher_id
    WHERE sc.id = p_chain_id AND t.profile_id = auth.uid()
    FOR UPDATE OF sc;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rantaian sanad tidak ditemui.' USING ERRCODE = 'P0002';
    END IF;
    IF NOT public.sanad_chain_editable_status(c.verification_status) THEN
        RAISE EXCEPTION 'Rantaian berstatus % tidak boleh dihantar.', c.verification_status USING ERRCODE = '42501';
    END IF;

    SELECT id INTO v_self FROM public.sanad_nodes WHERE linked_teacher_id = c.teacher_id;
    IF v_self IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.sanad_edges WHERE sanad_chain_id = c.id AND target_node_id = v_self
    ) THEN
        RAISE EXCEPTION 'Rantaian mesti berakhir dengan diri anda (tambah guru yang memberi ijazah kepada anda).'
            USING ERRCODE = '22023';
    END IF;

    -- Every node in the chain must lead to the teacher's node.
    SELECT COUNT(*) INTO v_nodes FROM (
        SELECT source_node_id FROM public.sanad_edges WHERE sanad_chain_id = c.id
        UNION SELECT target_node_id FROM public.sanad_edges WHERE sanad_chain_id = c.id
    ) x;
    WITH RECURSIVE up(node_id, depth) AS (
        SELECT v_self, 0
        UNION
        SELECT e.source_node_id, u.depth + 1 FROM public.sanad_edges e
        JOIN up u ON e.target_node_id = u.node_id
        WHERE e.sanad_chain_id = c.id AND u.depth < 500
    )
    SELECT COUNT(DISTINCT node_id), MAX(depth) INTO v_reaching, v_depth FROM up;
    IF v_reaching <> v_nodes THEN
        RAISE EXCEPTION 'Terdapat % perawi yang tidak bersambung kepada anda dalam rantaian ini.', v_nodes - v_reaching
            USING ERRCODE = '22023';
    END IF;

    SELECT n.full_name_rumi, n.full_name_arabic INTO v_direct
    FROM public.sanad_edges e JOIN public.sanad_nodes n ON n.id = e.source_node_id
    WHERE e.sanad_chain_id = c.id AND e.target_node_id = v_self
    ORDER BY e.sequence_order, e.created_at LIMIT 1;

    UPDATE public.sanad_chains
    SET verification_status = 'submitted', generation_depth = v_depth,
        immediate_teacher_name_rumi = v_direct.full_name_rumi, immediate_teacher_name_arabic = v_direct.full_name_arabic
    WHERE id = c.id;
    UPDATE public.sanad_edges SET verification_status = 'submitted'
    WHERE sanad_chain_id = c.id AND verification_status IN ('draft', 'revision_required');
    UPDATE public.sanad_nodes SET verification_status = 'submitted'
    WHERE verification_status IN ('draft', 'revision_required')
      AND (created_by = auth.uid() OR linked_teacher_id = c.teacher_id)
      AND id IN (SELECT source_node_id FROM public.sanad_edges WHERE sanad_chain_id = c.id
                 UNION SELECT target_node_id FROM public.sanad_edges WHERE sanad_chain_id = c.id);

    PERFORM public.record_sanad_chain_revision(c.id, 'submitted');

    INSERT INTO public.verification_submissions (teacher_id, target_type, target_record_id, submitted_by, applicant_notes)
    VALUES (c.teacher_id, 'sanad_chain', c.id, auth.uid(), LEFT(NULLIF(btrim(p_notes), ''), 1000))
    RETURNING id INTO v_submission;
    RETURN v_submission;
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_my_sanad_chain(p_chain_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    c public.sanad_chains%ROWTYPE;
BEGIN
    SELECT sc.* INTO c FROM public.sanad_chains sc
    JOIN public.teachers t ON t.id = sc.teacher_id
    WHERE sc.id = p_chain_id AND t.profile_id = auth.uid() FOR UPDATE OF sc;
    IF NOT FOUND OR c.verification_status <> 'submitted' THEN
        RAISE EXCEPTION 'Hanya rantaian yang dihantar dan belum disemak boleh ditarik balik.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.sanad_chains SET verification_status = 'draft' WHERE id = c.id;
    UPDATE public.sanad_edges SET verification_status = 'draft' WHERE sanad_chain_id = c.id AND verification_status = 'submitted';
    UPDATE public.sanad_nodes SET verification_status = 'draft'
    WHERE verification_status = 'submitted' AND (created_by = auth.uid() OR linked_teacher_id = c.teacher_id)
      AND id IN (SELECT source_node_id FROM public.sanad_edges WHERE sanad_chain_id = c.id
                 UNION SELECT target_node_id FROM public.sanad_edges WHERE sanad_chain_id = c.id)
      -- keep nodes that are still part of another submitted chain
      AND NOT EXISTS (SELECT 1 FROM public.sanad_edges e2 JOIN public.sanad_chains c2 ON c2.id = e2.sanad_chain_id
                      WHERE c2.id <> c.id AND c2.verification_status <> 'draft'
                        AND (e2.source_node_id = sanad_nodes.id OR e2.target_node_id = sanad_nodes.id));
    UPDATE public.verification_submissions
    SET status = 'draft', decision_summary = 'Ditarik balik oleh guru.', decided_at = NOW()
    WHERE target_type = 'sanad_chain' AND target_record_id = c.id AND status = 'submitted';
    PERFORM public.record_sanad_chain_revision(c.id, 'withdrawn');
END;
$$;

-- New draft copy of an approved/published chain; the original stays public until replaced.
CREATE OR REPLACE FUNCTION public.revise_my_sanad_chain(p_chain_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    c public.sanad_chains%ROWTYPE;
    v_new UUID;
BEGIN
    SELECT sc.* INTO c FROM public.sanad_chains sc
    JOIN public.teachers t ON t.id = sc.teacher_id
    WHERE sc.id = p_chain_id AND t.profile_id = auth.uid();
    IF NOT FOUND OR c.verification_status NOT IN ('approved', 'published') THEN
        RAISE EXCEPTION 'Hanya rantaian yang telah diluluskan boleh disemak semula.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.sanad_chains (teacher_id, title, qiraat_id, riwayat_id, tariq_id, transmission_method,
        immediate_teacher_name_rumi, immediate_teacher_name_arabic, ijazah_date, ijazah_location, institution_id,
        generation_depth, public_notes, allow_public_graph_export, verification_status, is_public, supersedes_chain_id)
    VALUES (c.teacher_id, c.title, c.qiraat_id, c.riwayat_id, c.tariq_id, c.transmission_method,
        c.immediate_teacher_name_rumi, c.immediate_teacher_name_arabic, c.ijazah_date, c.ijazah_location, c.institution_id,
        c.generation_depth, c.public_notes, c.allow_public_graph_export, 'draft', FALSE, c.id)
    RETURNING id INTO v_new;

    INSERT INTO public.sanad_edges (sanad_chain_id, source_node_id, target_node_id, sequence_order,
        transmission_relationship, riwayat_context, supporting_evidence, transmission_date_text,
        transmission_location, notes, verification_status, is_public)
    SELECT v_new, source_node_id, target_node_id, sequence_order, transmission_relationship, riwayat_context,
        supporting_evidence, transmission_date_text, transmission_location, notes, 'draft', FALSE
    FROM public.sanad_edges WHERE sanad_chain_id = c.id;

    PERFORM public.record_sanad_chain_revision(v_new, 'revision_started');
    RETURN v_new;
EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Semakan baharu bagi rantaian ini sudah wujud.' USING ERRCODE = '23505';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_my_sanad_node() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_my_sanad_chain(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.withdraw_my_sanad_chain(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revise_my_sanad_chain(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_sanad_node() TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_my_sanad_chain(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_my_sanad_chain(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revise_my_sanad_chain(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 6. Node search for linking (explicit choice; never auto-merge)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_linkable_sanad_nodes(p_query TEXT, p_limit INT DEFAULT 10)
RETURNS TABLE (
    id UUID, full_name_rumi VARCHAR, full_name_arabic VARCHAR, historical_title VARCHAR,
    generation_category VARCHAR, death_year_hijri VARCHAR, country_or_region VARCHAR,
    verification_status verification_status, is_mine BOOLEAN, similarity REAL
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH q AS (SELECT NULLIF(public.normalize_search_text(LEFT(p_query, 100)), '') AS q)
    SELECT n.id, n.full_name_rumi, n.full_name_arabic, n.historical_title, n.generation_category,
           n.death_year_hijri, n.country_or_region, n.verification_status,
           (n.created_by = auth.uid()) AS is_mine,
           GREATEST(
               word_similarity(q.q, public.normalize_search_text(n.full_name_rumi)),
               word_similarity(q.q, public.normalize_search_text(n.full_name_arabic)),
               word_similarity(q.q, public.normalize_search_text(array_to_string(n.alternative_spellings, ' ')))
           ) AS similarity
    FROM public.sanad_nodes n CROSS JOIN q
    WHERE q.q IS NOT NULL
      AND auth.uid() IS NOT NULL
      AND public.can_use_sanad_node(n.id)
      AND (
          public.normalize_search_text(concat_ws(' ', n.full_name_rumi, n.full_name_arabic,
              array_to_string(n.alternative_spellings, ' '))) LIKE '%' || q.q || '%'
          OR word_similarity(q.q, public.normalize_search_text(concat_ws(' ', n.full_name_rumi, n.full_name_arabic,
              array_to_string(n.alternative_spellings, ' ')))) >= 0.4
      )
    ORDER BY similarity DESC, n.full_name_rumi
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 25);
$$;
REVOKE EXECUTE ON FUNCTION public.search_linkable_sanad_nodes(TEXT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_linkable_sanad_nodes(TEXT, INT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. Public graph
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_sanad_graph(
    p_chain_id UUID DEFAULT NULL,
    p_teacher_id UUID DEFAULT NULL,
    p_qiraat_id UUID DEFAULT NULL,
    p_riwayat_id UUID DEFAULT NULL,
    p_max_edges INT DEFAULT 1500
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH chains AS (
        SELECT c.*, vt.public_display_name AS teacher_name,
               q.title_rumi AS qiraat, q.title_arabic AS qiraat_arabic,
               r.full_label_rumi AS riwayat, r.full_label_arabic AS riwayat_arabic, tt.name_rumi AS tariq,
               (c.allow_public_graph_export AND COALESCE(tps.allow_graph_download, FALSE)) AS allow_export
        FROM public.v_public_sanad_chains c
        JOIN public.v_public_teachers vt ON vt.id = c.teacher_id
        JOIN public.qiraat_types q ON q.id = c.qiraat_id
        JOIN public.riwayat_types r ON r.id = c.riwayat_id
        LEFT JOIN public.tariq_types tt ON tt.id = c.tariq_id
        LEFT JOIN public.teacher_public_settings tps ON tps.teacher_id = c.teacher_id
        WHERE COALESCE(tps.show_sanad_graph, TRUE)
          AND (p_chain_id IS NULL OR c.id = p_chain_id)
          AND (p_teacher_id IS NULL OR c.teacher_id = p_teacher_id)
          AND (p_qiraat_id IS NULL OR c.qiraat_id = p_qiraat_id)
          AND (p_riwayat_id IS NULL OR c.riwayat_id = p_riwayat_id)
    ),
    edges AS (
        SELECT e.* FROM public.sanad_edges e
        JOIN chains c ON c.id = e.sanad_chain_id
        JOIN public.sanad_nodes s ON s.id = e.source_node_id AND s.is_public AND s.verification_status IN ('approved', 'published')
        JOIN public.sanad_nodes t ON t.id = e.target_node_id AND t.is_public AND t.verification_status IN ('approved', 'published')
        WHERE e.is_public AND e.verification_status IN ('approved', 'published')
        ORDER BY e.sanad_chain_id, e.sequence_order
        LIMIT LEAST(GREATEST(COALESCE(p_max_edges, 1500), 1), 3000)
    ),
    node_ids AS (SELECT source_node_id AS id FROM edges UNION SELECT target_node_id FROM edges)
    SELECT jsonb_build_object(
        'chains', COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id', c.id, 'sanad_code', c.sanad_code, 'title', c.title, 'teacher_id', c.teacher_id,
            'teacher_name', c.teacher_name, 'qiraat', c.qiraat, 'qiraat_arabic', c.qiraat_arabic,
            'riwayat', c.riwayat, 'riwayat_arabic', c.riwayat_arabic, 'tariq', c.tariq,
            'qiraat_id', c.qiraat_id, 'riwayat_id', c.riwayat_id,
            'transmission_method', c.transmission_method, 'ijazah_date', c.ijazah_date,
            'ijazah_location', c.ijazah_location, 'generation_depth', c.generation_depth,
            'public_notes', c.public_notes, 'verification_status', c.verification_status,
            'verified_at', c.verified_at, 'is_demo_record', c.is_demo_record, 'allow_export', c.allow_export)
            ORDER BY c.title) FROM chains c), '[]'::jsonb),
        'nodes', COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id', n.id, 'full_name_rumi', n.full_name_rumi, 'full_name_arabic', n.full_name_arabic,
            'alternative_spellings', n.alternative_spellings, 'historical_title', n.historical_title,
            'generation_category', n.generation_category, 'birth_year_hijri', n.birth_year_hijri,
            'death_year_hijri', n.death_year_hijri, 'birth_year_miladi', n.birth_year_miladi,
            'death_year_miladi', n.death_year_miladi, 'country_or_region', n.country_or_region,
            'biography', n.biography, 'scholarly_references', n.scholarly_references,
            'verification_status', n.verification_status,
            'linked_teacher_id', CASE WHEN public.is_teacher_public(n.linked_teacher_id) THEN n.linked_teacher_id END))
            FROM public.sanad_nodes n WHERE n.id IN (SELECT id FROM node_ids)), '[]'::jsonb),
        'edges', COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'id', e.id, 'chain_id', e.sanad_chain_id, 'source', e.source_node_id, 'target', e.target_node_id,
            'sequence_order', e.sequence_order, 'transmission_relationship', e.transmission_relationship,
            'riwayat_context', e.riwayat_context, 'transmission_date_text', e.transmission_date_text,
            'transmission_location', e.transmission_location, 'verification_status', e.verification_status))
            FROM edges e), '[]'::jsonb)
    );
$$;
GRANT EXECUTE ON FUNCTION public.get_public_sanad_graph(UUID, UUID, UUID, UUID, INT) TO anon, authenticated;

-- Audit revisions table changes too.
DROP TRIGGER IF EXISTS trg_audit_sanad_chain_revisions ON public.sanad_chain_revisions;
CREATE TRIGGER trg_audit_sanad_chain_revisions
    AFTER INSERT ON public.sanad_chain_revisions
    FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- ========================================================================
-- FILE: supabase/migrations/009_documents.sql
-- ========================================================================
-- =============================================================================
-- MySanad Migration 009: Supporting documents (Phase 5)
--
-- Flow
--   1. The browser uploads the file to storage bucket 'private-ijazah-documents' at
--      "<auth.uid()>/<random>.<ext>" (storage RLS: owner folder only; bucket limits
--      15 MB and PDF/JPEG/PNG/WebP).
--   2. The server checks the file signature (magic bytes), then calls
--      register_my_document(), which atomically:
--        * confirms the object exists in the caller's folder and its stored size matches,
--        * checks linked sanad chain / ijazah belong to the caller,
--        * enforces a per-teacher document limit,
--        * inserts the document (status 'submitted') and its verification request.
--   3. delete_my_document() removes a document that has not entered review and closes
--      its open request; the server then removes the storage object.
--
-- Direct INSERT into public.documents by teachers is removed: registration has one path.
-- =============================================================================

DROP POLICY IF EXISTS "Teacher upload own documents" ON public.documents;

CREATE INDEX IF NOT EXISTS idx_documents_teacher ON public.documents (teacher_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_documents_review_status ON public.documents (review_status);

CREATE OR REPLACE FUNCTION public.max_documents_per_teacher()
RETURNS INT LANGUAGE sql IMMUTABLE AS $$ SELECT 50 $$;

CREATE OR REPLACE FUNCTION public.register_my_document(
    p_storage_path TEXT,
    p_category TEXT,
    p_original_filename TEXT,
    p_mime_type TEXT,
    p_file_size_bytes BIGINT,
    p_sanad_chain_id UUID DEFAULT NULL,
    p_ijazah_record_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
    v_teacher UUID;
    v_object storage.objects%ROWTYPE;
    v_doc UUID;
    v_filename TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Log masuk diperlukan.' USING ERRCODE = '42501';
    END IF;
    SELECT id INTO v_teacher FROM public.teachers WHERE profile_id = auth.uid();
    IF v_teacher IS NULL THEN
        RAISE EXCEPTION 'Profil guru belum dicipta.' USING ERRCODE = 'P0002';
    END IF;

    IF p_storage_path IS NULL
       OR p_storage_path !~ ('^' || auth.uid()::TEXT || '/[a-z0-9-]{16,64}\.(pdf|jpg|png|webp)$') THEN
        RAISE EXCEPTION 'Laluan storan dokumen tidak sah.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_object FROM storage.objects
    WHERE bucket_id = 'private-ijazah-documents' AND name = p_storage_path;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Fail tidak ditemui dalam storan. Sila muat naik semula.' USING ERRCODE = 'P0002';
    END IF;
    IF v_object.metadata ? 'size' AND (v_object.metadata ->> 'size')::BIGINT <> p_file_size_bytes THEN
        RAISE EXCEPTION 'Saiz fail tidak sepadan dengan fail yang dimuat naik.' USING ERRCODE = '22023';
    END IF;

    IF p_sanad_chain_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.sanad_chains WHERE id = p_sanad_chain_id AND teacher_id = v_teacher
    ) THEN
        RAISE EXCEPTION 'Rantaian sanad bukan milik anda.' USING ERRCODE = '42501';
    END IF;
    IF p_ijazah_record_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.ijazah_records WHERE id = p_ijazah_record_id AND teacher_id = v_teacher
    ) THEN
        RAISE EXCEPTION 'Rekod ijazah bukan milik anda.' USING ERRCODE = '42501';
    END IF;

    IF (SELECT COUNT(*) FROM public.documents WHERE teacher_id = v_teacher) >= public.max_documents_per_teacher() THEN
        RAISE EXCEPTION 'Had % dokumen bagi setiap guru telah dicapai.', public.max_documents_per_teacher() USING ERRCODE = '22023';
    END IF;

    -- Keep only a safe display name (no paths or control characters).
    v_filename := LEFT(btrim(regexp_replace(regexp_replace(COALESCE(p_original_filename, ''), '^.*[\\/]', ''), '[[:cntrl:]]', '', 'g')), 255);
    IF v_filename = '' THEN
        v_filename := 'dokumen';
    END IF;

    INSERT INTO public.documents (teacher_id, sanad_chain_id, ijazah_record_id, category, original_filename,
        storage_bucket, storage_path, mime_type, file_size_bytes, review_status)
    VALUES (v_teacher, p_sanad_chain_id, p_ijazah_record_id, p_category, v_filename,
        'private-ijazah-documents', p_storage_path, p_mime_type, p_file_size_bytes, 'submitted')
    RETURNING id INTO v_doc;

    INSERT INTO public.verification_submissions (teacher_id, target_type, target_record_id, submitted_by, applicant_notes)
    VALUES (v_teacher, 'ijazah_document', v_doc, auth.uid(), LEFT(NULLIF(btrim(p_notes), ''), 1000));

    RETURN v_doc;
END;
$$;

-- Returns the storage path so the caller can remove the object afterwards.
CREATE OR REPLACE FUNCTION public.delete_my_document(p_document_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    d public.documents%ROWTYPE;
BEGIN
    SELECT doc.* INTO d FROM public.documents doc
    JOIN public.teachers t ON t.id = doc.teacher_id
    WHERE doc.id = p_document_id AND t.profile_id = auth.uid()
    FOR UPDATE OF doc;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Dokumen tidak ditemui.' USING ERRCODE = 'P0002';
    END IF;
    IF d.review_status NOT IN ('draft', 'submitted', 'revision_required', 'rejected') THEN
        RAISE EXCEPTION 'Dokumen yang sedang atau telah disemak tidak boleh dipadam.' USING ERRCODE = '42501';
    END IF;

    UPDATE public.verification_submissions
    SET status = 'draft', decision_summary = 'Dokumen dipadam oleh guru.', decided_at = NOW()
    WHERE target_type = 'ijazah_document' AND target_record_id = d.id AND status IN ('submitted', 'revision_required');

    DELETE FROM public.documents WHERE id = d.id;
    RETURN d.storage_path;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_my_document(TEXT, TEXT, TEXT, TEXT, BIGINT, UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_my_document(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_my_document(TEXT, TEXT, TEXT, TEXT, BIGINT, UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_document(UUID) TO authenticated;

-- ========================================================================
-- FILE: supabase/migrations/010_admin_review.sql
-- ========================================================================
-- =============================================================================
-- MySanad Migration 010: Administrator review workflow (Phase 6)
--
-- Every administrator decision is ONE transaction in a SECURITY DEFINER function that
-- checks is_admin_or_verifier() and then updates, together:
--   the target record(s) -> the verification submission -> a verification_reviews row
--   (public feedback + internal comment) -> derived badges -> a teacher notification.
-- Row-level audit triggers (migration 005) record every change.
--
-- Badges are derived, never hand-set:
--   documents_reviewed_badge = at least one approved/published document
--   sanad_reviewed_badge     = at least one public approved/published sanad chain
-- "Profil Disahkan" is shown when the profile status is 'published'.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Notifications: wider set of types, owner may only mark read or delete
-- -----------------------------------------------------------------------------
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_notification_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_notification_type_check CHECK (notification_type IN (
    'registration_completed', 'profile_submitted', 'verification_started', 'correction_requested',
    'profile_approved', 'profile_published', 'profile_rejected', 'profile_unpublished',
    'sanad_approved', 'sanad_rejected', 'sanad_revision_required',
    'document_approved', 'document_rejected', 'document_revision_required',
    'change_request_approved', 'change_request_rejected',
    'account_suspended', 'account_reinstated'
));

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created ON public.notifications (recipient_profile_id, created_at DESC);

CREATE POLICY "Users delete own notifications" ON public.notifications
    FOR DELETE USING (recipient_profile_id = auth.uid());

CREATE OR REPLACE FUNCTION public.guard_notifications()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF public.is_trusted_backend() THEN
        RETURN NEW;
    END IF;
    IF (to_jsonb(NEW) - ARRAY['is_read', 'read_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['is_read', 'read_at']) THEN
        RAISE EXCEPTION 'Hanya status dibaca boleh diubah.' USING ERRCODE = '42501';
    END IF;
    NEW.read_at := CASE WHEN NEW.is_read THEN COALESCE(OLD.read_at, NOW()) END;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_notifications ON public.notifications;
CREATE TRIGGER trg_guard_notifications BEFORE UPDATE ON public.notifications
    FOR EACH ROW EXECUTE FUNCTION public.guard_notifications();

CREATE OR REPLACE FUNCTION public.notify_teacher(
    p_teacher_id UUID, p_type TEXT, p_title TEXT, p_message TEXT,
    p_entity_type TEXT DEFAULT NULL, p_entity_id UUID DEFAULT NULL, p_url TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    INSERT INTO public.notifications (recipient_profile_id, notification_type, title, message,
        related_entity_type, related_entity_id, action_url)
    SELECT t.profile_id, p_type, LEFT(p_title, 255), LEFT(p_message, 2000), p_entity_type, p_entity_id, p_url
    FROM public.teachers t WHERE t.id = p_teacher_id;
$$;
REVOKE EXECUTE ON FUNCTION public.notify_teacher(UUID, TEXT, TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. Helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.require_admin()
RETURNS VOID
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin_or_verifier() THEN
        RAISE EXCEPTION 'Hanya pentadbir dibenarkan.' USING ERRCODE = '42501';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_teacher_badges(p_teacher_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE public.teachers t SET
        documents_reviewed_badge = EXISTS (
            SELECT 1 FROM public.documents d WHERE d.teacher_id = t.id AND d.review_status IN ('approved', 'published')),
        sanad_reviewed_badge = EXISTS (
            SELECT 1 FROM public.sanad_chains c WHERE c.teacher_id = t.id AND c.is_public
              AND c.verification_status IN ('approved', 'published'))
    WHERE t.id = p_teacher_id;
$$;
REVOKE EXECUTE ON FUNCTION public.refresh_teacher_badges(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.decision_to_status(p_decision TEXT)
RETURNS verification_status
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE p_decision
        WHEN 'approve' THEN 'approved'::verification_status
        WHEN 'publish' THEN 'published'::verification_status
        WHEN 'revision_required' THEN 'revision_required'::verification_status
        WHEN 'reject' THEN 'rejected'::verification_status
    END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Start review (locks the target for the teacher)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_start_review(p_submission_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    s public.verification_submissions%ROWTYPE;
BEGIN
    PERFORM public.require_admin();
    SELECT * INTO s FROM public.verification_submissions WHERE id = p_submission_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Permohonan tidak ditemui.' USING ERRCODE = 'P0002';
    END IF;
    IF s.status <> 'submitted' THEN
        RAISE EXCEPTION 'Hanya permohonan berstatus dihantar boleh mula disemak.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.verification_submissions SET status = 'under_review', assigned_reviewer_id = auth.uid() WHERE id = s.id;

    IF s.target_type = 'teacher_profile' THEN
        UPDATE public.teachers SET profile_verification_status = 'under_review'
        WHERE id = s.target_record_id AND profile_verification_status = 'submitted';
    ELSIF s.target_type = 'ijazah_document' THEN
        UPDATE public.documents SET review_status = 'under_review', reviewer_id = auth.uid()
        WHERE id = s.target_record_id AND review_status = 'submitted';
    ELSIF s.target_type = 'sanad_chain' THEN
        UPDATE public.sanad_chains SET verification_status = 'under_review'
        WHERE id = s.target_record_id AND verification_status = 'submitted';
        UPDATE public.sanad_edges SET verification_status = 'under_review'
        WHERE sanad_chain_id = s.target_record_id AND verification_status = 'submitted';
    END IF;

    PERFORM public.notify_teacher(s.teacher_id, 'verification_started', 'Semakan bermula',
        'Pentadbir MySanad telah mula menyemak permohonan anda (' || s.submission_code || ').',
        s.target_type, s.target_record_id, '/teacher/verification');
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Decide a submission
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_decide_submission(
    p_submission_id UUID,
    p_decision TEXT,
    p_public_feedback TEXT DEFAULT NULL,
    p_internal_comment TEXT DEFAULT NULL,
    p_checklist JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    s public.verification_submissions%ROWTYPE;
    v_status verification_status := public.decision_to_status(p_decision);
    v_feedback TEXT := NULLIF(btrim(COALESCE(p_public_feedback, '')), '');
    v_positive BOOLEAN;
    v_chain public.sanad_chains%ROWTYPE;
    v_blocked INT;
    v_type TEXT;
    v_title TEXT;
BEGIN
    PERFORM public.require_admin();
    IF v_status IS NULL THEN
        RAISE EXCEPTION 'Keputusan tidak sah.' USING ERRCODE = '22023';
    END IF;
    v_positive := v_status IN ('approved', 'published');
    IF NOT v_positive AND v_feedback IS NULL THEN
        RAISE EXCEPTION 'Ulasan kepada guru diperlukan untuk menolak atau meminta pembetulan.' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO s FROM public.verification_submissions WHERE id = p_submission_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Permohonan tidak ditemui.' USING ERRCODE = 'P0002';
    END IF;
    IF s.status NOT IN ('submitted', 'under_review') THEN
        RAISE EXCEPTION 'Permohonan ini telah diputuskan.' USING ERRCODE = '22023';
    END IF;

    IF s.target_type = 'teacher_profile' THEN
        UPDATE public.teachers SET
            profile_verification_status = v_status,
            is_published = (v_status = 'published'),
            published_at = CASE WHEN v_status = 'published' THEN COALESCE(published_at, NOW()) END
        WHERE id = s.target_record_id;
        -- Entries submitted with the profile follow the decision (individual entries can be decided separately).
        UPDATE public.teacher_education SET verification_status = v_status
        WHERE teacher_id = s.target_record_id AND verification_status IN ('submitted', 'under_review');
        UPDATE public.ijazah_records SET verification_status = v_status, is_public = v_positive
        WHERE teacher_id = s.target_record_id AND verification_status IN ('submitted', 'under_review');
        v_type := CASE v_status WHEN 'published' THEN 'profile_published' WHEN 'approved' THEN 'profile_approved'
                                WHEN 'rejected' THEN 'profile_rejected' ELSE 'correction_requested' END;
        v_title := CASE v_status WHEN 'published' THEN 'Profil anda telah diterbitkan' WHEN 'approved' THEN 'Profil anda telah diluluskan'
                                 WHEN 'rejected' THEN 'Permohonan profil ditolak' ELSE 'Pembetulan profil diperlukan' END;

    ELSIF s.target_type = 'ijazah_document' THEN
        UPDATE public.documents SET
            review_status = CASE WHEN v_status = 'published' THEN 'approved' ELSE v_status END,
            reviewer_id = auth.uid(), review_notes = v_feedback, reviewed_at = NOW()
        WHERE id = s.target_record_id;
        v_type := CASE WHEN v_positive THEN 'document_approved' WHEN v_status = 'rejected' THEN 'document_rejected'
                       ELSE 'document_revision_required' END;
        v_title := CASE WHEN v_positive THEN 'Dokumen anda telah disemak' WHEN v_status = 'rejected' THEN 'Dokumen ditolak'
                        ELSE 'Dokumen perlu dimuat naik semula' END;

    ELSIF s.target_type = 'sanad_chain' THEN
        SELECT * INTO v_chain FROM public.sanad_chains WHERE id = s.target_record_id FOR UPDATE;
        IF v_positive THEN
            SELECT COUNT(*) INTO v_blocked FROM (
                SELECT e.id FROM public.sanad_edges e WHERE e.sanad_chain_id = v_chain.id
                  AND e.verification_status IN ('revision_required', 'rejected', 'suspended')
                UNION ALL
                SELECT n.id FROM public.sanad_nodes n
                WHERE n.id IN (SELECT source_node_id FROM public.sanad_edges WHERE sanad_chain_id = v_chain.id
                               UNION SELECT target_node_id FROM public.sanad_edges WHERE sanad_chain_id = v_chain.id)
                  AND n.verification_status IN ('revision_required', 'rejected', 'suspended')
            ) x;
            IF v_blocked > 0 THEN
                RAISE EXCEPTION 'Rantaian tidak boleh diluluskan: % perawi/hubungan ditanda perlu pembetulan atau ditolak.', v_blocked
                    USING ERRCODE = '22023';
            END IF;
        END IF;

        UPDATE public.sanad_chains SET
            verification_status = v_status, is_public = v_positive,
            verified_by = CASE WHEN v_positive THEN auth.uid() END,
            verified_at = CASE WHEN v_positive THEN NOW() END
        WHERE id = v_chain.id;

        IF v_positive THEN
            UPDATE public.sanad_edges SET verification_status = 'approved', is_public = TRUE
            WHERE sanad_chain_id = v_chain.id AND verification_status IN ('draft', 'submitted', 'under_review');
            UPDATE public.sanad_nodes SET verification_status = 'approved', is_public = TRUE
            WHERE verification_status IN ('draft', 'submitted', 'under_review')
              AND id IN (SELECT source_node_id FROM public.sanad_edges WHERE sanad_chain_id = v_chain.id
                         UNION SELECT target_node_id FROM public.sanad_edges WHERE sanad_chain_id = v_chain.id);
            -- A newly approved revision replaces the version it supersedes.
            IF v_chain.supersedes_chain_id IS NOT NULL THEN
                UPDATE public.sanad_chains
                SET verification_status = 'suspended', is_public = FALSE,
                    internal_notes = concat_ws(E'\n', internal_notes, 'Digantikan oleh ' || v_chain.sanad_code || ' pada ' || NOW()::DATE)
                WHERE id = v_chain.supersedes_chain_id;
            END IF;
        ELSE
            UPDATE public.sanad_edges SET verification_status = v_status
            WHERE sanad_chain_id = v_chain.id AND verification_status IN ('submitted', 'under_review');
            UPDATE public.sanad_nodes SET verification_status = CASE WHEN v_status = 'rejected' THEN 'draft' ELSE v_status END
            WHERE verification_status IN ('submitted', 'under_review')
              AND id IN (SELECT source_node_id FROM public.sanad_edges WHERE sanad_chain_id = v_chain.id
                         UNION SELECT target_node_id FROM public.sanad_edges WHERE sanad_chain_id = v_chain.id);
        END IF;
        PERFORM public.record_sanad_chain_revision(v_chain.id, 'decision_' || v_status::TEXT);
        v_type := CASE WHEN v_positive THEN 'sanad_approved' WHEN v_status = 'rejected' THEN 'sanad_rejected'
                       ELSE 'sanad_revision_required' END;
        v_title := CASE WHEN v_positive THEN 'Jalur sanad anda telah disemak' WHEN v_status = 'rejected' THEN 'Rantaian sanad ditolak'
                        ELSE 'Pembetulan rantaian sanad diperlukan' END;
    ELSE
        RAISE EXCEPTION 'Jenis permohonan % belum disokong.', s.target_type USING ERRCODE = '22023';
    END IF;

    UPDATE public.verification_submissions SET
        status = v_status, assigned_reviewer_id = auth.uid(), decision_summary = v_feedback, decided_at = NOW()
    WHERE id = s.id;

    INSERT INTO public.verification_reviews (submission_id, reviewer_id, previous_status, new_status,
        public_feedback, internal_admin_comment, checklist_verified)
    VALUES (s.id, auth.uid(), s.status, v_status, v_feedback,
        NULLIF(btrim(COALESCE(p_internal_comment, '')), ''), COALESCE(p_checklist, '{}'::jsonb));

    PERFORM public.refresh_teacher_badges(s.teacher_id);
    PERFORM public.notify_teacher(s.teacher_id, v_type, v_title,
        COALESCE(v_feedback, 'Keputusan semakan bagi ' || s.submission_code || ' telah dibuat.'),
        s.target_type, s.target_record_id, '/teacher/verification');
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Change requests for published profiles
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_decide_change_request(p_request_id UUID, p_approve BOOLEAN, p_feedback TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r public.teacher_change_requests%ROWTYPE;
    v_feedback TEXT := NULLIF(btrim(COALESCE(p_feedback, '')), '');
BEGIN
    PERFORM public.require_admin();
    SELECT * INTO r FROM public.teacher_change_requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Permohonan perubahan tidak ditemui.' USING ERRCODE = 'P0002';
    END IF;
    IF r.status NOT IN ('submitted', 'under_review') THEN
        RAISE EXCEPTION 'Permohonan ini telah diputuskan.' USING ERRCODE = '22023';
    END IF;
    IF NOT p_approve AND v_feedback IS NULL THEN
        RAISE EXCEPTION 'Ulasan kepada guru diperlukan untuk menolak permohonan.' USING ERRCODE = '22023';
    END IF;

    IF p_approve THEN
        -- Only whitelisted keys exist in proposed_changes (CHECK constraint, migration 007).
        UPDATE public.teachers t SET
            (full_name_rumi, full_name_arabic, public_display_name, alternative_spellings, professional_title, gender,
             teaching_state_id, teaching_district_id, primary_institution_id, photo_url, short_bio, full_biography,
             teaching_experience_years, specializations, primary_qiraat_id, primary_riwayat_id)
          = (SELECT p.full_name_rumi, p.full_name_arabic, p.public_display_name, p.alternative_spellings, p.professional_title,
                    p.gender, p.teaching_state_id, p.teaching_district_id, p.primary_institution_id, p.photo_url, p.short_bio,
                    p.full_biography, p.teaching_experience_years, p.specializations, p.primary_qiraat_id, p.primary_riwayat_id
             FROM jsonb_populate_record(t, r.proposed_changes) p)
        WHERE t.id = r.teacher_id;
    END IF;

    UPDATE public.teacher_change_requests SET
        status = CASE WHEN p_approve THEN 'approved'::verification_status ELSE 'rejected'::verification_status END,
        reviewer_id = auth.uid(), decision_summary = v_feedback, decided_at = NOW()
    WHERE id = r.id;

    PERFORM public.notify_teacher(r.teacher_id,
        CASE WHEN p_approve THEN 'change_request_approved' ELSE 'change_request_rejected' END,
        CASE WHEN p_approve THEN 'Perubahan profil diluluskan' ELSE 'Perubahan profil ditolak' END,
        COALESCE(v_feedback, 'Perubahan profil anda kini dipaparkan.'),
        'teacher_change_request', r.id, '/teacher/profile');
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. Publication, suspension, featuring
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_publication(p_teacher_id UUID, p_action TEXT, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    t public.teachers%ROWTYPE;
    v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
    PERFORM public.require_admin();
    SELECT * INTO t FROM public.teachers WHERE id = p_teacher_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Guru tidak ditemui.' USING ERRCODE = 'P0002';
    END IF;

    IF p_action = 'publish' THEN
        IF t.profile_verification_status NOT IN ('approved', 'published') THEN
            RAISE EXCEPTION 'Hanya profil yang diluluskan boleh diterbitkan.' USING ERRCODE = '22023';
        END IF;
        UPDATE public.teachers SET profile_verification_status = 'published', is_published = TRUE,
            published_at = COALESCE(published_at, NOW()) WHERE id = t.id;
        PERFORM public.notify_teacher(t.id, 'profile_published', 'Profil anda telah diterbitkan',
            'Profil anda kini dipaparkan dalam direktori awam MySanad.', 'teacher_profile', t.id, '/teacher/dashboard');
    ELSIF p_action = 'unpublish' THEN
        IF v_reason IS NULL THEN RAISE EXCEPTION 'Nyatakan sebab.' USING ERRCODE = '22023'; END IF;
        UPDATE public.teachers SET profile_verification_status = 'approved', is_published = FALSE WHERE id = t.id;
        PERFORM public.notify_teacher(t.id, 'profile_unpublished', 'Profil anda tidak lagi diterbitkan', v_reason,
            'teacher_profile', t.id, '/teacher/dashboard');
    ELSIF p_action = 'suspend' THEN
        IF v_reason IS NULL THEN RAISE EXCEPTION 'Nyatakan sebab penggantungan.' USING ERRCODE = '22023'; END IF;
        UPDATE public.teachers SET profile_verification_status = 'suspended', is_published = FALSE WHERE id = t.id;
        PERFORM public.notify_teacher(t.id, 'account_suspended', 'Profil anda digantung', v_reason,
            'teacher_profile', t.id, '/teacher/dashboard');
    ELSIF p_action = 'reinstate' THEN
        IF t.profile_verification_status <> 'suspended' THEN
            RAISE EXCEPTION 'Hanya profil yang digantung boleh dipulihkan.' USING ERRCODE = '22023';
        END IF;
        UPDATE public.teachers SET profile_verification_status = 'approved', is_published = FALSE WHERE id = t.id;
        PERFORM public.notify_teacher(t.id, 'account_reinstated', 'Profil anda dipulihkan',
            COALESCE(v_reason, 'Profil anda telah dipulihkan dan menunggu penerbitan semula.'), 'teacher_profile', t.id, '/teacher/dashboard');
    ELSE
        RAISE EXCEPTION 'Tindakan tidak sah.' USING ERRCODE = '22023';
    END IF;
    PERFORM public.refresh_teacher_badges(t.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_featured(p_teacher_id UUID, p_featured BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.require_admin();
    UPDATE public.teachers SET is_featured = p_featured AND is_published WHERE id = p_teacher_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Guru tidak ditemui.' USING ERRCODE = 'P0002';
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. Individual items (education, ijazah, nodes, edges, contacts)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_item_status(p_table TEXT, p_id UUID, p_status verification_status)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_public BOOLEAN := p_status IN ('approved', 'published');
    v_teacher UUID;
BEGIN
    PERFORM public.require_admin();
    IF p_status NOT IN ('approved', 'revision_required', 'rejected', 'suspended') THEN
        RAISE EXCEPTION 'Status tidak sah untuk item.' USING ERRCODE = '22023';
    END IF;
    CASE p_table
        WHEN 'teacher_education' THEN
            UPDATE public.teacher_education SET verification_status = p_status WHERE id = p_id RETURNING teacher_id INTO v_teacher;
        WHEN 'ijazah_records' THEN
            UPDATE public.ijazah_records SET verification_status = p_status, is_public = v_public WHERE id = p_id RETURNING teacher_id INTO v_teacher;
        WHEN 'sanad_nodes' THEN
            UPDATE public.sanad_nodes SET verification_status = p_status, is_public = v_public WHERE id = p_id;
        WHEN 'sanad_edges' THEN
            UPDATE public.sanad_edges SET verification_status = p_status, is_public = v_public WHERE id = p_id;
        WHEN 'public_contact_channels' THEN
            UPDATE public.public_contact_channels SET is_approved = v_public WHERE id = p_id RETURNING teacher_id INTO v_teacher;
        ELSE
            RAISE EXCEPTION 'Jadual % tidak dibenarkan.', p_table USING ERRCODE = '42501';
    END CASE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Item tidak ditemui.' USING ERRCODE = 'P0002';
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 8. Reveal an encrypted IC for identity verification: audit first, then return the ciphertext
--    (decryption happens in trusted server code; the key never reaches the database).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_teacher_ic_ciphertext(p_teacher_id UUID, p_reason TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cipher TEXT;
BEGIN
    PERFORM public.require_admin();
    IF char_length(btrim(COALESCE(p_reason, ''))) < 5 THEN
        RAISE EXCEPTION 'Nyatakan sebab akses (sekurang-kurangnya 5 aksara).' USING ERRCODE = '22023';
    END IF;
    SELECT ic_number_encrypted INTO v_cipher FROM public.teachers WHERE id = p_teacher_id;
    INSERT INTO public.audit_logs (actor_profile_id, actor_role, action, entity_table, entity_id, new_values)
    VALUES (auth.uid(), public.get_current_user_role(), 'APP:REVEAL_IC', 'teachers', p_teacher_id,
            jsonb_build_object('reason', LEFT(btrim(p_reason), 300)));
    RETURN v_cipher;
END;
$$;

-- -----------------------------------------------------------------------------
-- 9. Dashboard counts
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_dashboard_counts()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.require_admin();
    RETURN jsonb_build_object(
        'open_by_type', COALESCE((SELECT jsonb_object_agg(target_type, n) FROM (
            SELECT target_type, COUNT(*) n FROM public.verification_submissions
            WHERE status IN ('submitted', 'under_review') GROUP BY target_type) x), '{}'::jsonb),
        'open_change_requests', (SELECT COUNT(*) FROM public.teacher_change_requests WHERE status IN ('submitted', 'under_review')),
        'pending_items', (SELECT COUNT(*) FROM public.teacher_education WHERE verification_status = 'submitted')
                       + (SELECT COUNT(*) FROM public.ijazah_records WHERE verification_status = 'submitted'),
        'teachers_total', (SELECT COUNT(*) FROM public.teachers),
        'teachers_published', (SELECT COUNT(*) FROM public.teachers WHERE is_published),
        'teachers_suspended', (SELECT COUNT(*) FROM public.teachers WHERE profile_verification_status = 'suspended'),
        'chains_public', (SELECT COUNT(*) FROM public.sanad_chains WHERE is_public AND verification_status IN ('approved', 'published')),
        'unverified_institutions', (SELECT COUNT(*) FROM public.institutions WHERE NOT is_verified AND NOT is_archived)
    );
END;
$$;

DO $$
DECLARE
    fn TEXT;
BEGIN
    FOREACH fn IN ARRAY ARRAY[
        'public.admin_start_review(uuid)',
        'public.admin_decide_submission(uuid, text, text, text, jsonb)',
        'public.admin_decide_change_request(uuid, boolean, text)',
        'public.admin_set_publication(uuid, text, text)',
        'public.admin_set_featured(uuid, boolean)',
        'public.admin_set_item_status(text, uuid, verification_status)',
        'public.admin_get_teacher_ic_ciphertext(uuid, text)',
        'public.admin_dashboard_counts()'
    ] LOOP
        EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn);
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
    END LOOP;
END $$;

-- Teachers may read their own review requests' public feedback via verification_submissions
-- (decision_summary). verification_reviews (with internal comments) stays admin-only.

-- ========================================================================
-- FILE: supabase/migrations/011_settings_analytics_reference.sql
-- ========================================================================
-- =============================================================================
-- MySanad Migration 011: System settings, analytics, reference data (Phase 7)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. System settings (fixed keys, typed values, Super Admin edits)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY CHECK (key IN ('registration_open', 'announcement', 'contact_email', 'max_documents_per_teacher')),
    value JSONB NOT NULL,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.system_settings (key, value, is_public) VALUES
    ('registration_open', 'true'::jsonb, TRUE),
    ('announcement', '""'::jsonb, TRUE),
    ('contact_email', 'null'::jsonb, TRUE),
    ('max_documents_per_teacher', '50'::jsonb, FALSE)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read public or admin settings" ON public.system_settings
    FOR SELECT USING (is_public OR public.is_admin_or_verifier());
CREATE POLICY "Super admin updates settings" ON public.system_settings
    FOR UPDATE USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
REVOKE INSERT, DELETE, TRUNCATE ON public.system_settings FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_system_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.key <> OLD.key OR NEW.is_public <> OLD.is_public THEN
        RAISE EXCEPTION 'Kunci dan keterlihatan tetapan tidak boleh diubah.' USING ERRCODE = '42501';
    END IF;
    CASE NEW.key
        WHEN 'registration_open' THEN
            IF jsonb_typeof(NEW.value) <> 'boolean' THEN RAISE EXCEPTION 'Nilai mesti benar/palsu.' USING ERRCODE = '22023'; END IF;
        WHEN 'announcement' THEN
            IF jsonb_typeof(NEW.value) <> 'string' OR char_length(NEW.value #>> '{}') > 300 THEN
                RAISE EXCEPTION 'Pengumuman mesti teks, maksimum 300 aksara.' USING ERRCODE = '22023';
            END IF;
        WHEN 'contact_email' THEN
            IF NOT (jsonb_typeof(NEW.value) = 'null'
                    OR (jsonb_typeof(NEW.value) = 'string' AND (NEW.value #>> '{}') ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'
                        AND char_length(NEW.value #>> '{}') <= 254)) THEN
                RAISE EXCEPTION 'Alamat emel tidak sah.' USING ERRCODE = '22023';
            END IF;
        WHEN 'max_documents_per_teacher' THEN
            IF jsonb_typeof(NEW.value) <> 'number' OR (NEW.value)::INT NOT BETWEEN 1 AND 200 OR (NEW.value)::NUMERIC <> (NEW.value)::INT THEN
                RAISE EXCEPTION 'Had dokumen mesti nombor bulat antara 1 dan 200.' USING ERRCODE = '22023';
            END IF;
    END CASE;
    NEW.updated_at := NOW();
    NEW.updated_by := auth.uid();
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_system_settings ON public.system_settings;
CREATE TRIGGER trg_guard_system_settings BEFORE UPDATE ON public.system_settings
    FOR EACH ROW EXECUTE FUNCTION public.guard_system_settings();

CREATE OR REPLACE FUNCTION public.get_setting(p_key TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT value FROM public.system_settings WHERE key = p_key;
$$;
REVOKE EXECUTE ON FUNCTION public.get_setting(TEXT) FROM PUBLIC, anon, authenticated;

-- Document limit now comes from settings.
CREATE OR REPLACE FUNCTION public.max_documents_per_teacher()
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE((public.get_setting('max_documents_per_teacher'))::INT, 50);
$$;

-- Registration switch is enforced where accounts are created, so calling the Auth API
-- directly cannot bypass it.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF COALESCE((public.get_setting('registration_open'))::BOOLEAN, TRUE) = FALSE THEN
        RAISE EXCEPTION 'Pendaftaran akaun baharu ditutup buat sementara waktu.' USING ERRCODE = '42501';
    END IF;
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

-- -----------------------------------------------------------------------------
-- 2. Reference data: audit, integrity
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['malaysian_districts', 'qiraat_types', 'riwayat_types', 'tariq_types', 'system_settings'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON public.%1$I', tbl);
        EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
                        FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()', tbl);
    END LOOP;
END $$;

-- audit_row_change() reads NEW.id; system_settings has no id column, so give it a dedicated variant.
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
    v_id TEXT;
BEGIN
    IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD) - v_redact; END IF;
    IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW) - v_redact; END IF;
    SELECT p.id INTO v_actor FROM public.profiles p WHERE p.id = auth.uid();
    v_id := COALESCE(v_new ->> 'id', v_old ->> 'id');
    INSERT INTO public.audit_logs (actor_profile_id, actor_role, action, entity_table, entity_id, old_values, new_values)
    VALUES (v_actor, public.get_current_user_role(), TG_OP, TG_TABLE_NAME,
            CASE WHEN v_id ~ '^[0-9a-f-]{36}$' THEN v_id::UUID END, v_old, v_new);
    RETURN NULL;
END;
$$;

-- Riwayat codes and tariq codes are stable identifiers: lower-case/upper-case letters, digits, dashes.
ALTER TABLE public.qiraat_types ADD CONSTRAINT chk_qiraat_code_format CHECK (code ~ '^[A-Z0-9-]{2,30}$') NOT VALID;
ALTER TABLE public.riwayat_types ADD CONSTRAINT chk_riwayat_code_format CHECK (code ~ '^[A-Z0-9-]{2,40}$') NOT VALID;
ALTER TABLE public.tariq_types ADD CONSTRAINT chk_tariq_code_format CHECK (code ~ '^[A-Z0-9-]{2,50}$') NOT VALID;
ALTER TABLE public.malaysian_districts ADD CONSTRAINT chk_district_slug_format CHECK (slug ~ '^[a-z0-9-]{2,120}$') NOT VALID;

-- Reference transmitters (curated by administrators, shared by all teachers).
CREATE UNIQUE INDEX IF NOT EXISTS uq_sanad_nodes_canonical_code ON public.sanad_nodes (canonical_code) WHERE canonical_code IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. Analytics (administrators only; real records only)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_analytics()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_months JSONB;
BEGIN
    PERFORM public.require_admin();

    WITH months AS (
        SELECT to_char(m, 'YYYY-MM') AS month, m AS start, m + INTERVAL '1 month' AS finish
        FROM generate_series(date_trunc('month', NOW()) - INTERVAL '11 months', date_trunc('month', NOW()), INTERVAL '1 month') m
    )
    SELECT jsonb_agg(jsonb_build_object(
        'month', month,
        'registered', (SELECT COUNT(*) FROM public.teachers t WHERE t.created_at >= start AND t.created_at < finish),
        'published', (SELECT COUNT(*) FROM public.teachers t WHERE t.published_at >= start AND t.published_at < finish),
        'approved', (SELECT COUNT(*) FROM public.verification_reviews r WHERE r.created_at >= start AND r.created_at < finish
                     AND r.new_status IN ('approved', 'published')),
        'revision', (SELECT COUNT(*) FROM public.verification_reviews r WHERE r.created_at >= start AND r.created_at < finish
                     AND r.new_status = 'revision_required'),
        'rejected', (SELECT COUNT(*) FROM public.verification_reviews r WHERE r.created_at >= start AND r.created_at < finish
                     AND r.new_status = 'rejected')
    ) ORDER BY month) INTO v_months FROM months;

    RETURN jsonb_build_object(
        'generated_at', NOW(),
        'months', COALESCE(v_months, '[]'::jsonb),
        'teachers_by_status', COALESCE((SELECT jsonb_object_agg(profile_verification_status, n) FROM (
            SELECT profile_verification_status, COUNT(*) n FROM public.teachers GROUP BY 1) x), '{}'::jsonb),
        'published_by_state', COALESCE((SELECT jsonb_agg(jsonb_build_object('state', name, 'slug', slug, 'count', teacher_count)
            ORDER BY teacher_count DESC, display_order) FROM public.v_public_state_stats), '[]'::jsonb),
        'chains_by_riwayat', COALESCE((SELECT jsonb_agg(jsonb_build_object('riwayat', label, 'count', n) ORDER BY n DESC) FROM (
            SELECT r.full_label_rumi AS label, COUNT(*) n FROM public.sanad_chains c JOIN public.riwayat_types r ON r.id = c.riwayat_id
            WHERE c.is_public AND c.verification_status IN ('approved', 'published') GROUP BY 1) x), '[]'::jsonb),
        'documents_by_status', COALESCE((SELECT jsonb_object_agg(review_status, n) FROM (
            SELECT review_status, COUNT(*) n FROM public.documents GROUP BY 1) x), '{}'::jsonb),
        'turnaround_hours', COALESCE((SELECT jsonb_agg(jsonb_build_object('type', target_type, 'decided', n,
                'median', ROUND(med::NUMERIC, 1), 'p90', ROUND(p90::NUMERIC, 1))) FROM (
            SELECT target_type, COUNT(*) n,
                   percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM decided_at - submitted_at) / 3600) med,
                   percentile_cont(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM decided_at - submitted_at) / 3600) p90
            FROM public.verification_submissions
            WHERE decided_at IS NOT NULL AND status <> 'draft' AND decided_at > NOW() - INTERVAL '180 days'
            GROUP BY target_type) x), '[]'::jsonb),
        'top_institutions', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', name, 'count', teacher_count) ORDER BY teacher_count DESC)
            FROM (SELECT name, teacher_count FROM public.v_public_institutions WHERE teacher_count > 0
                  ORDER BY teacher_count DESC, name LIMIT 10) x), '[]'::jsonb),
        'demo_teachers', (SELECT COUNT(*) FROM public.teachers WHERE is_demo_record)
    );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_analytics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_analytics() TO authenticated;
