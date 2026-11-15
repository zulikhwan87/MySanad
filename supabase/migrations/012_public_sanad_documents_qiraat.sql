-- =============================================================================
-- MySanad Migration 012: Public sanad documents + Qiraat & Riwayat browsing
--
-- 1. Teachers may ask for a sanad certificate ("Sijil Ijazah Sanad") to be shown on
--    their public profile (documents.show_publicly). It is shown ONLY when:
--      * the teacher asked for it,
--      * an administrator approved the document (so they can check for MyKad numbers,
--        addresses or other private data before it goes public),
--      * the teacher's profile is public.
--    Turning the request ON for an already-approved document sends it back for review.
--    Turning it OFF always works immediately.
--    Storage stays private; the server issues short-lived signed URLs through
--    public_sanad_document_path(), which only the service role may call.
-- 2. public_qiraat_riwayat_stats(): published-teacher counts per qiraat and riwayat
--    (same rule as the directory filter: primary qiraat/riwayat or an approved public chain).
-- =============================================================================

ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS show_publicly BOOLEAN NOT NULL DEFAULT FALSE;

-- Teachers cannot write documents directly; the flag changes only through the functions below.
-- A direct insert path does not exist (migration 009), so no guard change is needed.

-- register_my_document gains p_show_publicly (signature change: drop the old one).
DROP FUNCTION IF EXISTS public.register_my_document(TEXT, TEXT, TEXT, TEXT, BIGINT, UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.register_my_document(
    p_storage_path TEXT,
    p_category TEXT,
    p_original_filename TEXT,
    p_mime_type TEXT,
    p_file_size_bytes BIGINT,
    p_sanad_chain_id UUID DEFAULT NULL,
    p_ijazah_record_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_show_publicly BOOLEAN DEFAULT FALSE
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

REVOKE EXECUTE ON FUNCTION public.register_my_document(TEXT, TEXT, TEXT, TEXT, BIGINT, UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_my_document(TEXT, TEXT, TEXT, TEXT, BIGINT, UUID, UUID, TEXT, BOOLEAN) TO authenticated;

-- Teacher toggles public display of one of their sanad certificates.
-- Returns the document's review status after the change.
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
    WHERE doc.id = p_document_id AND t.profile_id = auth.uid()
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

REVOKE EXECUTE ON FUNCTION public.set_my_document_public(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_document_public(UUID, BOOLEAN) TO authenticated;

-- Shared visibility rule.
CREATE OR REPLACE FUNCTION public.is_public_sanad_document(d public.documents)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT d.show_publicly
       AND d.category = 'Sijil Ijazah Sanad'
       AND d.review_status IN ('approved', 'published')
       AND EXISTS (SELECT 1 FROM public.v_public_teachers vt WHERE vt.id = d.teacher_id);
$$;
REVOKE EXECUTE ON FUNCTION public.is_public_sanad_document(public.documents) FROM PUBLIC, anon, authenticated;

-- Public list for a profile. No storage path, file name or review notes.
CREATE OR REPLACE FUNCTION public.get_public_sanad_documents(p_teacher_id UUID)
RETURNS TABLE (
    id UUID,
    mime_type TEXT,
    sanad_chain_id UUID,
    chain_title TEXT,
    reviewed_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT d.id, d.mime_type::TEXT,
           c.id,
           c.title::TEXT,
           d.reviewed_at
    FROM public.documents d
    LEFT JOIN public.v_public_sanad_chains c ON c.id = d.sanad_chain_id
    WHERE d.teacher_id = p_teacher_id AND public.is_public_sanad_document(d)
    ORDER BY d.reviewed_at DESC NULLS LAST, d.uploaded_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_public_sanad_documents(UUID) TO anon, authenticated;

-- Storage path for the signed-URL route. Service role only.
CREATE OR REPLACE FUNCTION public.public_sanad_document_path(p_document_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT d.storage_path FROM public.documents d
    WHERE d.id = p_document_id AND public.is_public_sanad_document(d);
$$;
REVOKE EXECUTE ON FUNCTION public.public_sanad_document_path(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_sanad_document_path(UUID) TO service_role;

-- Published-teacher counts per qiraat and riwayat.
CREATE OR REPLACE FUNCTION public.public_qiraat_riwayat_stats()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', q.id,
        'code', q.code,
        'title_rumi', q.title_rumi,
        'title_arabic', q.title_arabic,
        'imam_name_rumi', q.imam_name_rumi,
        'teacher_count', (
            SELECT COUNT(*) FROM public.v_public_teachers vt
            WHERE vt.primary_qiraat_id = q.id OR EXISTS (
                SELECT 1 FROM public.v_public_sanad_chains c WHERE c.teacher_id = vt.id AND c.qiraat_id = q.id)),
        'riwayat', (
            SELECT COALESCE(jsonb_agg(jsonb_build_object(
                'id', r.id,
                'code', r.code,
                'label_rumi', r.full_label_rumi,
                'label_arabic', r.full_label_arabic,
                'teacher_count', (
                    SELECT COUNT(*) FROM public.v_public_teachers vt
                    WHERE vt.primary_riwayat_id = r.id OR EXISTS (
                        SELECT 1 FROM public.v_public_sanad_chains c WHERE c.teacher_id = vt.id AND c.riwayat_id = r.id))
            ) ORDER BY r.display_order, r.full_label_rumi), '[]'::jsonb)
            FROM public.riwayat_types r WHERE r.qiraat_id = q.id)
    ) ORDER BY q.display_order, q.title_rumi), '[]'::jsonb)
    FROM public.qiraat_types q;
$$;
GRANT EXECUTE ON FUNCTION public.public_qiraat_riwayat_stats() TO anon, authenticated;
