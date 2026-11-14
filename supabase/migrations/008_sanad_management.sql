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
