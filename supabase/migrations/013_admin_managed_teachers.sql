-- =============================================================================
-- MySanad Migration 013: Teachers managed by administrators
--
-- Some teachers (for example elderly teachers) cannot enter their own data. Administrators
-- may now create and maintain a teacher profile WITHOUT a login account
-- (teachers.profile_id NULL, managed_by_admin TRUE), and may edit any teacher's data.
-- Self-registration is unchanged.
--
--  * acting_teacher_id(p_teacher_id): NULL -> the caller's own teacher row (unchanged behaviour);
--    a value -> only administrators/verifiers may act for that teacher.
--  * The teacher-side functions accept an optional p_teacher_id (administrators only):
--    submit_my_teacher_profile, ensure_my_sanad_node, register_my_document. Chain and document
--    functions accept the owner OR an administrator (can_act_for_teacher).
--  * Profiles without an account are public when published (v_public_teachers, is_teacher_public).
--  * notify_teacher() skips teachers without an account.
--  * Teachers WITH an account get one notification (at most every 30 minutes) when an
--    administrator edits their data directly.
--  * admin_link_teacher_account(): attach a managed profile to a registered account later.
-- =============================================================================

ALTER TABLE public.teachers ALTER COLUMN profile_id DROP NOT NULL;
ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS managed_by_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.teachers DROP CONSTRAINT IF EXISTS chk_teachers_owner_or_managed;
ALTER TABLE public.teachers ADD CONSTRAINT chk_teachers_owner_or_managed
    CHECK (profile_id IS NOT NULL OR managed_by_admin);

CREATE OR REPLACE FUNCTION public.can_act_for_teacher(p_teacher_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.owns_teacher(p_teacher_id) OR public.is_admin_or_verifier();
$$;
REVOKE EXECUTE ON FUNCTION public.can_act_for_teacher(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_act_for_teacher(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.acting_teacher_id(p_teacher_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id UUID;
BEGIN
    IF p_teacher_id IS NULL THEN
        SELECT id INTO v_id FROM public.teachers WHERE profile_id = auth.uid();
        RETURN v_id;
    END IF;
    IF NOT public.is_admin_or_verifier() THEN
        RAISE EXCEPTION 'Hanya pentadbir boleh bertindak bagi pihak guru lain.' USING ERRCODE = '42501';
    END IF;
    SELECT id INTO v_id FROM public.teachers WHERE id = p_teacher_id;
    RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.acting_teacher_id(UUID) FROM PUBLIC, anon, authenticated;

-- RLS: administrators may write education rows (other teacher tables already allow it).
DROP POLICY IF EXISTS "Admin manage teacher education" ON public.teacher_education;
CREATE POLICY "Admin manage teacher education" ON public.teacher_education
    FOR ALL USING (public.is_admin_or_verifier()) WITH CHECK (public.is_admin_or_verifier());

CREATE OR REPLACE VIEW public.v_public_teachers WITH (security_barrier = true) AS
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
LEFT JOIN public.profiles p ON p.id = t.profile_id
JOIN public.malaysian_states ms ON ms.id = t.teaching_state_id
LEFT JOIN public.malaysian_districts md ON md.id = t.teaching_district_id
LEFT JOIN public.institutions i ON i.id = t.primary_institution_id
LEFT JOIN public.qiraat_types q ON q.id = t.primary_qiraat_id
LEFT JOIN public.riwayat_types r ON r.id = t.primary_riwayat_id
LEFT JOIN public.teacher_public_settings tps ON tps.teacher_id = t.id
WHERE t.is_published = TRUE
  AND t.profile_verification_status = 'published'
  AND t.archived_at IS NULL
  AND (t.profile_id IS NULL OR p.is_active = TRUE);

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
        LEFT JOIN public.profiles p ON p.id = t.profile_id
        WHERE t.id = p_teacher_id
          AND t.is_published = TRUE
          AND t.profile_verification_status = 'published'
          AND t.archived_at IS NULL
          AND (t.profile_id IS NULL OR p.is_active = TRUE)
    );
$$;

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
    FROM public.teachers t WHERE t.id = p_teacher_id AND t.profile_id IS NOT NULL;
$$;

DROP FUNCTION IF EXISTS public.submit_my_teacher_profile(TEXT);
CREATE OR REPLACE FUNCTION public.submit_my_teacher_profile(p_notes TEXT DEFAULT NULL, p_teacher_id UUID DEFAULT NULL)
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

    SELECT * INTO t FROM public.teachers WHERE id = public.acting_teacher_id(p_teacher_id) FOR UPDATE;
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
REVOKE EXECUTE ON FUNCTION public.submit_my_teacher_profile(TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_my_teacher_profile(TEXT, UUID) TO authenticated;

DROP FUNCTION IF EXISTS public.ensure_my_sanad_node();
CREATE OR REPLACE FUNCTION public.ensure_my_sanad_node(p_teacher_id UUID DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    t public.teachers%ROWTYPE;
    v_node UUID;
BEGIN
    SELECT * INTO t FROM public.teachers WHERE id = public.acting_teacher_id(p_teacher_id);
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
REVOKE EXECUTE ON FUNCTION public.ensure_my_sanad_node(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_my_sanad_node(UUID) TO authenticated;

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
    WHERE sc.id = p_chain_id AND public.can_act_for_teacher(t.id)
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
    WHERE sc.id = p_chain_id AND public.can_act_for_teacher(t.id) FOR UPDATE OF sc;
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
    WHERE sc.id = p_chain_id AND public.can_act_for_teacher(t.id);
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

DROP FUNCTION IF EXISTS public.register_my_document(TEXT, TEXT, TEXT, TEXT, BIGINT, UUID, UUID, TEXT, BOOLEAN);
CREATE OR REPLACE FUNCTION public.register_my_document(
    p_storage_path TEXT,
    p_category TEXT,
    p_original_filename TEXT,
    p_mime_type TEXT,
    p_file_size_bytes BIGINT,
    p_sanad_chain_id UUID DEFAULT NULL,
    p_ijazah_record_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_show_publicly BOOLEAN DEFAULT FALSE,
    p_teacher_id UUID DEFAULT NULL
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
    v_teacher := public.acting_teacher_id(p_teacher_id);
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

    IF COALESCE(p_show_publicly, FALSE) AND p_category <> 'Sijil Ijazah Sanad' THEN
        RAISE EXCEPTION 'Hanya Sijil Ijazah Sanad boleh dipaparkan kepada awam.' USING ERRCODE = '22023';
    END IF;

    IF (SELECT COUNT(*) FROM public.documents WHERE teacher_id = v_teacher) >= public.max_documents_per_teacher() THEN
        RAISE EXCEPTION 'Had % dokumen bagi setiap guru telah dicapai.', public.max_documents_per_teacher() USING ERRCODE = '22023';
    END IF;

    v_filename := LEFT(btrim(regexp_replace(regexp_replace(COALESCE(p_original_filename, ''), '^.*[\\/]', ''), '[[:cntrl:]]', '', 'g')), 255);
    IF v_filename = '' THEN
        v_filename := 'dokumen';
    END IF;

    INSERT INTO public.documents (teacher_id, sanad_chain_id, ijazah_record_id, category, original_filename,
        storage_bucket, storage_path, mime_type, file_size_bytes, review_status, show_publicly)
    VALUES (v_teacher, p_sanad_chain_id, p_ijazah_record_id, p_category, v_filename,
        'private-ijazah-documents', p_storage_path, p_mime_type, p_file_size_bytes, 'submitted', COALESCE(p_show_publicly, FALSE))
    RETURNING id INTO v_doc;

    INSERT INTO public.verification_submissions (teacher_id, target_type, target_record_id, submitted_by, applicant_notes)
    VALUES (v_teacher, 'ijazah_document', v_doc, auth.uid(), LEFT(NULLIF(btrim(p_notes), ''), 1000));

    RETURN v_doc;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.register_my_document(TEXT, TEXT, TEXT, TEXT, BIGINT, UUID, UUID, TEXT, BOOLEAN, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_my_document(TEXT, TEXT, TEXT, TEXT, BIGINT, UUID, UUID, TEXT, BOOLEAN, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_my_document_public(p_document_id UUID, p_show BOOLEAN)
RETURNS verification_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    d public.documents%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Log masuk diperlukan.' USING ERRCODE = '42501';
    END IF;
    SELECT doc.* INTO d FROM public.documents doc
    JOIN public.teachers t ON t.id = doc.teacher_id
    WHERE doc.id = p_document_id AND public.can_act_for_teacher(t.id)
    FOR UPDATE OF doc;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Dokumen tidak ditemui.' USING ERRCODE = 'P0002';
    END IF;

    IF NOT COALESCE(p_show, FALSE) THEN
        UPDATE public.documents SET show_publicly = FALSE, updated_at = NOW() WHERE id = d.id;
        RETURN d.review_status;
    END IF;

    IF d.show_publicly THEN
        RETURN d.review_status;
    END IF;
    IF d.category <> 'Sijil Ijazah Sanad' THEN
        RAISE EXCEPTION 'Hanya Sijil Ijazah Sanad boleh dipaparkan kepada awam.' USING ERRCODE = '22023';
    END IF;
    IF d.review_status IN ('rejected', 'suspended') THEN
        RAISE EXCEPTION 'Dokumen berstatus % tidak boleh dipaparkan.', d.review_status USING ERRCODE = '42501';
    END IF;

    IF d.review_status IN ('approved', 'published') THEN
        -- Approved for private records only: an administrator must check it again before it goes public.
        UPDATE public.documents
        SET show_publicly = TRUE, review_status = 'submitted', reviewer_id = NULL, reviewed_at = NULL, updated_at = NOW()
        WHERE id = d.id;
        INSERT INTO public.verification_submissions (teacher_id, target_type, target_record_id, submitted_by, applicant_notes)
        SELECT d.teacher_id, 'ijazah_document', d.id, auth.uid(), 'Permohonan paparan awam sijil sanad.'
        WHERE NOT EXISTS (
            SELECT 1 FROM public.verification_submissions
            WHERE target_type = 'ijazah_document' AND target_record_id = d.id AND status IN ('submitted', 'under_review'));
        RETURN 'submitted';
    END IF;

    -- Not decided yet: the administrator sees the request when reviewing.
    UPDATE public.documents SET show_publicly = TRUE, updated_at = NOW() WHERE id = d.id;
    RETURN d.review_status;
END;
$$;


-- Notify a teacher who has an account when an administrator edits their data directly
-- (not through review functions, which send their own notifications).
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_notification_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_notification_type_check CHECK (notification_type IN (
    'registration_completed', 'profile_submitted', 'verification_started', 'correction_requested',
    'profile_approved', 'profile_published', 'profile_rejected', 'profile_unpublished',
    'sanad_approved', 'sanad_rejected', 'sanad_revision_required',
    'document_approved', 'document_rejected', 'document_revision_required',
    'change_request_approved', 'change_request_rejected',
    'account_suspended', 'account_reinstated', 'profile_updated_by_admin', 'account_linked'
));

CREATE OR REPLACE FUNCTION public.record_admin_edit(p_teacher_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_recipient UUID;
BEGIN
    IF NOT public.is_admin_or_verifier() THEN
        RETURN;
    END IF;
    SELECT profile_id INTO v_recipient FROM public.teachers WHERE id = p_teacher_id;
    IF v_recipient IS NULL OR v_recipient = auth.uid() THEN
        RETURN;
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.notifications
        WHERE recipient_profile_id = v_recipient AND notification_type = 'profile_updated_by_admin'
          AND created_at > NOW() - INTERVAL '30 minutes'
    ) THEN
        RETURN;
    END IF;
    INSERT INTO public.notifications (recipient_profile_id, notification_type, title, message, related_entity_type, related_entity_id, action_url)
    VALUES (v_recipient, 'profile_updated_by_admin', 'Maklumat anda dikemas kini oleh pentadbir',
        'Pentadbir MySanad telah mengemas kini maklumat profil atau rekod anda. Semak portal guru untuk melihat perubahan.',
        'teacher', p_teacher_id, '/teacher/dashboard');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.record_admin_edit(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_admin_edit(UUID) TO authenticated;

-- SECURITY INVOKER on purpose: current_user is 'authenticated' only for direct API writes;
-- review functions (SECURITY DEFINER) run as the owner and send their own notifications.
CREATE OR REPLACE FUNCTION public.notify_admin_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_row JSONB := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
BEGIN
    IF current_user <> 'authenticated' THEN
        RETURN NULL;
    END IF;
    PERFORM public.record_admin_edit(
        CASE WHEN TG_TABLE_NAME = 'teachers' THEN (v_row ->> 'id')::UUID ELSE (v_row ->> 'teacher_id')::UUID END);
    RETURN NULL;
END;
$$;

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['teachers', 'teacher_education', 'ijazah_records', 'public_contact_channels', 'sanad_chains', 'teacher_public_settings'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_notify_admin_edit ON public.%I', tbl);
        EXECUTE format('CREATE TRIGGER trg_notify_admin_edit AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.notify_admin_edit()', tbl);
    END LOOP;
END;
$$;

-- Attach a profile created by an administrator to a registered account (e.g. the teacher's child).
CREATE OR REPLACE FUNCTION public.admin_link_teacher_account(p_teacher_id UUID, p_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_profile UUID;
BEGIN
    PERFORM public.require_admin();
    SELECT id INTO v_profile FROM public.profiles WHERE lower(email) = lower(btrim(p_email)) AND is_active;
    IF v_profile IS NULL THEN
        RAISE EXCEPTION 'Tiada akaun aktif dengan emel ini. Minta guru mendaftar dan mengesahkan emel dahulu.' USING ERRCODE = 'P0002';
    END IF;
    IF EXISTS (SELECT 1 FROM public.teachers WHERE profile_id = v_profile) THEN
        RAISE EXCEPTION 'Akaun ini sudah mempunyai profil guru.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.teachers SET profile_id = v_profile, managed_by_admin = FALSE
    WHERE id = p_teacher_id AND profile_id IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Profil ini sudah dipautkan kepada akaun.' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.notifications (recipient_profile_id, notification_type, title, message, related_entity_type, related_entity_id, action_url)
    VALUES (v_profile, 'account_linked', 'Profil guru dipautkan kepada akaun anda',
        'Pentadbir MySanad telah memautkan profil guru kepada akaun anda. Anda kini boleh mengurusnya melalui portal guru.',
        'teacher', p_teacher_id, '/teacher/dashboard');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_link_teacher_account(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_link_teacher_account(UUID, TEXT) TO authenticated;
