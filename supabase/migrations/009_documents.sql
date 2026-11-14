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
