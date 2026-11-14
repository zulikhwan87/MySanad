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
