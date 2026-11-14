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
