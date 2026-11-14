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
