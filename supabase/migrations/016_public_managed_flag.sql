-- =============================================================================
-- MySanad Migration 016: Public profiles show who entered the data
--
-- v_public_teachers gains managed_by_admin (appended; existing columns unchanged), so a profile
-- entered by an administrator on the teacher's behalf can say so instead of "submitted by the teacher".
-- get_public_teacher_profile() returns it automatically (to_jsonb of the view row). Idempotent.
-- =============================================================================

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
    t.published_at,
    t.managed_by_admin
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
