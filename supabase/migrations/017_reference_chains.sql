-- =============================================================================
-- MySanad Migration 017: Reference chains (rantaian rujukan)
--
-- Administrators curate the upper part of common sanad chains (e.g. from a well-known shaykh up
-- to Rasulullah SAW) so teachers do not retype them.
--
--  * reference_chains / reference_chain_links: separate from teachers' chains. Each starts as a
--    DRAFT and is used by teachers only after an administrator ACTIVATES it. Links can be changed
--    only while the chain is draft or inactive, so an active chain is never altered silently.
--  * attach_reference_chain(): COPIES the chosen part of an active reference chain into a
--    teacher's draft chain. The copied links are ordinary draft edges, reviewed with the chain.
--    Editing, deactivating or deleting a reference later never changes teachers' chains.
--  * admin_create_reference_from_chain(): start a draft reference by copying the upper part of an
--    existing approved chain.
--  * Setting reference_chains_enabled turns the whole feature off for teachers.
--  * Everything here can be removed without touching teachers' data (drop the two tables and the
--    functions below).
-- Idempotent.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.reference_chains (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL CHECK (char_length(btrim(title)) >= 3),
    qiraat_id UUID REFERENCES public.qiraat_types(id) ON DELETE SET NULL,
    riwayat_id UUID REFERENCES public.riwayat_types(id) ON DELETE SET NULL,
    tariq_id UUID REFERENCES public.tariq_types(id) ON DELETE SET NULL,
    root_node_id UUID NOT NULL REFERENCES public.sanad_nodes(id) ON DELETE RESTRICT,
    notes TEXT CHECK (notes IS NULL OR char_length(notes) <= 2000),
    status VARCHAR(10) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'inactive')),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    activated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    activated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.reference_chain_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reference_chain_id UUID NOT NULL REFERENCES public.reference_chains(id) ON DELETE CASCADE,
    source_node_id UUID NOT NULL REFERENCES public.sanad_nodes(id) ON DELETE RESTRICT,
    target_node_id UUID NOT NULL REFERENCES public.sanad_nodes(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_reference_link_no_self CHECK (source_node_id <> target_node_id),
    CONSTRAINT uq_reference_link UNIQUE (reference_chain_id, source_node_id, target_node_id)
);
CREATE INDEX IF NOT EXISTS idx_reference_links_chain ON public.reference_chain_links (reference_chain_id);

ALTER TABLE public.system_settings DROP CONSTRAINT IF EXISTS system_settings_key_check;
ALTER TABLE public.system_settings ADD CONSTRAINT system_settings_key_check
    CHECK (key IN ('registration_open', 'announcement', 'contact_email', 'max_documents_per_teacher', 'reference_chains_enabled'));
INSERT INTO public.system_settings (key, value, is_public) VALUES ('reference_chains_enabled', 'true'::jsonb, FALSE)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.reference_chains_enabled()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE((public.get_setting('reference_chains_enabled'))::BOOLEAN, FALSE);
$$;
REVOKE EXECUTE ON FUNCTION public.reference_chains_enabled() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reference_chains_enabled() TO authenticated;

-- Settings guard: same as migration 011, plus the new key.
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
        WHEN 'registration_open', 'reference_chains_enabled' THEN
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

-- -----------------------------------------------------------------------------
-- Access: administrators manage everything; teachers read active chains while the feature is on.
-- -----------------------------------------------------------------------------
ALTER TABLE public.reference_chains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reference_chain_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin manage reference chains" ON public.reference_chains;
CREATE POLICY "Admin manage reference chains" ON public.reference_chains
    FOR ALL USING (public.is_admin_or_verifier()) WITH CHECK (public.is_admin_or_verifier());
DROP POLICY IF EXISTS "Teachers read active reference chains" ON public.reference_chains;
CREATE POLICY "Teachers read active reference chains" ON public.reference_chains
    FOR SELECT TO authenticated USING (status = 'active' AND public.reference_chains_enabled());

DROP POLICY IF EXISTS "Admin manage reference links" ON public.reference_chain_links;
CREATE POLICY "Admin manage reference links" ON public.reference_chain_links
    FOR ALL USING (public.is_admin_or_verifier()) WITH CHECK (public.is_admin_or_verifier());
DROP POLICY IF EXISTS "Teachers read active reference links" ON public.reference_chain_links;
CREATE POLICY "Teachers read active reference links" ON public.reference_chain_links
    FOR SELECT TO authenticated USING (EXISTS (
        SELECT 1 FROM public.reference_chains rc
        WHERE rc.id = reference_chain_id AND rc.status = 'active' AND public.reference_chains_enabled()
    ));

REVOKE ALL ON public.reference_chains, public.reference_chain_links FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reference_chains, public.reference_chain_links TO authenticated;

-- -----------------------------------------------------------------------------
-- Guards
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_reference_chains()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.status := 'draft';
        NEW.activated_by := NULL;
        NEW.activated_at := NULL;
        IF NOT public.is_trusted_backend() THEN NEW.created_by := auth.uid(); END IF;
        RETURN NEW;
    END IF;
    -- Status changes only through admin_set_reference_chain_status().
    IF NEW.status IS DISTINCT FROM OLD.status AND current_setting('mysanad.reference_status', TRUE) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'Status rantaian rujukan diubah melalui butang Aktifkan / Nyahaktifkan.' USING ERRCODE = '42501';
    END IF;
    IF OLD.status = 'active' AND NEW.status = 'active' AND NEW.root_node_id IS DISTINCT FROM OLD.root_node_id THEN
        RAISE EXCEPTION 'Nyahaktifkan rantaian rujukan dahulu untuk menyuntingnya.' USING ERRCODE = '42501';
    END IF;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_reference_chains ON public.reference_chains;
CREATE TRIGGER trg_guard_reference_chains BEFORE INSERT OR UPDATE ON public.reference_chains
    FOR EACH ROW EXECUTE FUNCTION public.guard_reference_chains();

CREATE OR REPLACE FUNCTION public.guard_reference_chain_links()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_chain UUID := COALESCE(NEW.reference_chain_id, OLD.reference_chain_id);
BEGIN
    IF (SELECT status FROM public.reference_chains WHERE id = v_chain) = 'active' THEN
        RAISE EXCEPTION 'Nyahaktifkan rantaian rujukan dahulu untuk menyuntingnya.' USING ERRCODE = '42501';
    END IF;
    IF TG_OP <> 'DELETE' AND EXISTS (
        WITH RECURSIVE down(node_id) AS (
            SELECT NEW.target_node_id
            UNION
            SELECT l.target_node_id FROM public.reference_chain_links l
            JOIN down d ON l.source_node_id = d.node_id
            WHERE l.reference_chain_id = NEW.reference_chain_id AND l.id <> NEW.id
        )
        SELECT 1 FROM down WHERE node_id = NEW.source_node_id
    ) THEN
        RAISE EXCEPTION 'Hubungan ini akan membentuk kitaran dalam rantaian rujukan.' USING ERRCODE = '22023';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS trg_guard_reference_chain_links ON public.reference_chain_links;
CREATE TRIGGER trg_guard_reference_chain_links BEFORE INSERT OR UPDATE OR DELETE ON public.reference_chain_links
    FOR EACH ROW EXECUTE FUNCTION public.guard_reference_chain_links();

DO $$
DECLARE
    tbl TEXT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['reference_chains', 'reference_chain_links'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON public.%1$I', tbl);
        EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
                        FOR EACH ROW EXECUTE FUNCTION public.audit_row_change()', tbl);
    END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- Activate / deactivate
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_reference_chain_status(p_id UUID, p_status TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    rc public.reference_chains%ROWTYPE;
    v_nodes INT;
    v_reaching INT;
BEGIN
    IF NOT public.is_admin_or_verifier() THEN
        RAISE EXCEPTION 'Hanya pentadbir boleh melakukan tindakan ini.' USING ERRCODE = '42501';
    END IF;
    IF p_status NOT IN ('active', 'inactive') THEN
        RAISE EXCEPTION 'Status tidak sah.' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO rc FROM public.reference_chains WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rantaian rujukan tidak ditemui.' USING ERRCODE = 'P0002';
    END IF;

    IF p_status = 'active' THEN
        IF NOT EXISTS (SELECT 1 FROM public.reference_chain_links WHERE reference_chain_id = rc.id) THEN
            RAISE EXCEPTION 'Tambah sekurang-kurangnya seorang perawi di atas perawi permulaan.' USING ERRCODE = '22023';
        END IF;
        -- Every perawi must lead down to the starting perawi.
        SELECT COUNT(*) INTO v_nodes FROM (
            SELECT source_node_id FROM public.reference_chain_links WHERE reference_chain_id = rc.id
            UNION SELECT target_node_id FROM public.reference_chain_links WHERE reference_chain_id = rc.id
            UNION SELECT rc.root_node_id
        ) x;
        WITH RECURSIVE up(node_id) AS (
            SELECT rc.root_node_id
            UNION
            SELECT l.source_node_id FROM public.reference_chain_links l JOIN up u ON l.target_node_id = u.node_id
            WHERE l.reference_chain_id = rc.id
        )
        SELECT COUNT(*) INTO v_reaching FROM up;
        IF v_reaching <> v_nodes THEN
            RAISE EXCEPTION 'Terdapat % perawi yang tidak bersambung kepada perawi permulaan.', v_nodes - v_reaching USING ERRCODE = '22023';
        END IF;
        -- Teachers may only link to verified, public perawi.
        UPDATE public.sanad_nodes SET verification_status = 'approved', is_public = TRUE
        WHERE (verification_status <> 'approved' OR NOT is_public)
          AND linked_teacher_id IS NULL
          AND id IN (SELECT source_node_id FROM public.reference_chain_links WHERE reference_chain_id = rc.id
                     UNION SELECT target_node_id FROM public.reference_chain_links WHERE reference_chain_id = rc.id);
    END IF;

    PERFORM set_config('mysanad.reference_status', 'on', TRUE);
    UPDATE public.reference_chains
    SET status = p_status,
        activated_by = CASE WHEN p_status = 'active' THEN auth.uid() ELSE activated_by END,
        activated_at = CASE WHEN p_status = 'active' THEN NOW() ELSE activated_at END
    WHERE id = rc.id;
    PERFORM set_config('mysanad.reference_status', 'off', TRUE);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_set_reference_chain_status(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_reference_chain_status(UUID, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- Start a draft reference from an existing approved chain (copy the part above p_root_node_id).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_reference_from_chain(p_title TEXT, p_chain_id UUID, p_root_node_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    c public.sanad_chains%ROWTYPE;
    v_id UUID;
BEGIN
    IF NOT public.is_admin_or_verifier() THEN
        RAISE EXCEPTION 'Hanya pentadbir boleh melakukan tindakan ini.' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO c FROM public.sanad_chains WHERE id = p_chain_id;
    IF NOT FOUND OR c.verification_status NOT IN ('approved', 'published') THEN
        RAISE EXCEPTION 'Hanya rantaian yang telah diluluskan boleh disalin.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.sanad_edges WHERE sanad_chain_id = c.id AND target_node_id = p_root_node_id) THEN
        RAISE EXCEPTION 'Pilih perawi yang mempunyai guru di atasnya dalam rantaian ini.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM public.sanad_nodes WHERE id = p_root_node_id AND linked_teacher_id IS NOT NULL) THEN
        RAISE EXCEPTION 'Perawi permulaan tidak boleh guru berdaftar.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.reference_chains (title, qiraat_id, riwayat_id, tariq_id, root_node_id, notes, created_by)
    VALUES (LEFT(btrim(p_title), 255), c.qiraat_id, c.riwayat_id, c.tariq_id, p_root_node_id,
            'Disalin daripada ' || c.sanad_code || '. Semak setiap perawi sebelum diaktifkan.', auth.uid())
    RETURNING id INTO v_id;

    WITH RECURSIVE up(node_id) AS (
        SELECT p_root_node_id
        UNION
        SELECT e.source_node_id FROM public.sanad_edges e JOIN up u ON e.target_node_id = u.node_id
        WHERE e.sanad_chain_id = c.id
    )
    INSERT INTO public.reference_chain_links (reference_chain_id, source_node_id, target_node_id)
    SELECT DISTINCT v_id, e.source_node_id, e.target_node_id
    FROM public.sanad_edges e
    WHERE e.sanad_chain_id = c.id AND e.target_node_id IN (SELECT node_id FROM up);
    RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_create_reference_from_chain(TEXT, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_reference_from_chain(TEXT, UUID, UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- Teachers (or administrators acting for them): copy part of an active reference into a draft chain.
-- p_from_node_id (a perawi in the reference) becomes the teacher of p_student_node_id, and every
-- link above p_from_node_id is copied. Returns the number of links added.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attach_reference_chain(
    p_chain_id UUID,
    p_student_node_id UUID,
    p_reference_chain_id UUID,
    p_from_node_id UUID
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    c public.sanad_chains%ROWTYPE;
    rc public.reference_chains%ROWTYPE;
    v_title TEXT;
    v_added INT;
BEGIN
    SELECT sc.* INTO c FROM public.sanad_chains sc WHERE sc.id = p_chain_id AND public.can_act_for_teacher(sc.teacher_id);
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rantaian sanad tidak ditemui.' USING ERRCODE = 'P0002';
    END IF;
    IF NOT public.sanad_chain_editable_status(c.verification_status) THEN
        RAISE EXCEPTION 'Rantaian ini dikunci. Klik "Betulkan sanad" atau tarik balik dahulu.' USING ERRCODE = '42501';
    END IF;
    IF NOT public.reference_chains_enabled() THEN
        RAISE EXCEPTION 'Fungsi rantaian rujukan tidak diaktifkan.' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO rc FROM public.reference_chains WHERE id = p_reference_chain_id AND status = 'active';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rantaian rujukan tidak ditemui atau tidak aktif.' USING ERRCODE = 'P0002';
    END IF;
    IF NOT (p_from_node_id = rc.root_node_id OR EXISTS (
        SELECT 1 FROM public.reference_chain_links WHERE reference_chain_id = rc.id
          AND (source_node_id = p_from_node_id OR target_node_id = p_from_node_id))) THEN
        RAISE EXCEPTION 'Perawi yang dipilih bukan sebahagian daripada rantaian rujukan ini.' USING ERRCODE = '22023';
    END IF;
    IF NOT (EXISTS (SELECT 1 FROM public.sanad_edges WHERE sanad_chain_id = c.id
                      AND (source_node_id = p_student_node_id OR target_node_id = p_student_node_id))
            OR EXISTS (SELECT 1 FROM public.sanad_nodes WHERE id = p_student_node_id AND linked_teacher_id = c.teacher_id)) THEN
        RAISE EXCEPTION 'Perawi murid tidak ditemui dalam rantaian anda.' USING ERRCODE = '22023';
    END IF;
    IF p_student_node_id = p_from_node_id THEN
        RAISE EXCEPTION 'Perawi tidak boleh meriwayatkan daripada dirinya sendiri.' USING ERRCODE = '22023';
    END IF;

    v_title := 'Disalin daripada rantaian rujukan: ' || rc.title;
    WITH RECURSIVE up(node_id) AS (
        SELECT p_from_node_id
        UNION
        SELECT l.source_node_id FROM public.reference_chain_links l JOIN up u ON l.target_node_id = u.node_id
        WHERE l.reference_chain_id = rc.id
    ),
    wanted AS (
        SELECT p_from_node_id AS source_node_id, p_student_node_id AS target_node_id
        UNION
        SELECT l.source_node_id, l.target_node_id FROM public.reference_chain_links l
        WHERE l.reference_chain_id = rc.id AND l.target_node_id IN (SELECT node_id FROM up)
    ),
    ins AS (
        INSERT INTO public.sanad_edges (sanad_chain_id, source_node_id, target_node_id, transmission_relationship,
                                        notes, verification_status, is_public)
        SELECT c.id, w.source_node_id, w.target_node_id, NULL, v_title, 'draft', FALSE
        FROM wanted w
        ON CONFLICT (sanad_chain_id, source_node_id, target_node_id) DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_added FROM ins;
    RETURN v_added;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.attach_reference_chain(UUID, UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_reference_chain(UUID, UUID, UUID, UUID) TO authenticated;
