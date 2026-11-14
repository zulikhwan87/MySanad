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
