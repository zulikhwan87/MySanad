/**
 * Phase 4: sanad chains, nodes, edges, revisions and the public graph (migration 008).
 * All names are fictional test fixtures.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createTestDatabase, setRoleAsOwner, signUp, stateId } from './harness';

let db: PGlite;
let verifier: string;
let qiraat: string;
let riwayat: string;

interface T {
  uid: string;
  id: string;
  self: string;
}
let guru: T;
let other: T;

const q1 = async <R,>(sql: string, params: unknown[] = []) => (await db.query<R>(sql, params)).rows[0];

async function teacher(email: string): Promise<T> {
  const uid = await signUp(db, email);
  const kel = await stateId(db, 'kelantan');
  const id = await as(db, 'authenticated', uid, async () =>
    (
      await db.query<{ id: string }>(
        `INSERT INTO teachers (profile_id, full_name_rumi, full_name_arabic, public_display_name, teaching_state_id)
         VALUES ($1, 'Guru Ujian Sanad', 'معلم', 'Guru Ujian Sanad', $2) RETURNING id`,
        [uid, kel],
      )
    ).rows[0].id,
  );
  const self = await as(db, 'authenticated', uid, async () => (await q1<{ n: string }>(`SELECT ensure_my_sanad_node() n`)).n);
  return { uid, id, self };
}

async function node(t: T, rumi: string, arabic = 'شيخ') {
  return as(db, 'authenticated', t.uid, async () =>
    (
      await q1<{ id: string }>(
        `INSERT INTO sanad_nodes (full_name_rumi, full_name_arabic, alternative_spellings, generation_category)
         VALUES ($1, $2, '{}', 'Masyaikh Mutaakhirin') RETURNING id`,
        [rumi, arabic],
      )
    ).id,
  );
}

async function chain(t: T, title = 'Sanad Hafs Ujian') {
  return as(db, 'authenticated', t.uid, async () =>
    (
      await q1<{ id: string }>(
        `INSERT INTO sanad_chains (teacher_id, title, qiraat_id, riwayat_id) VALUES ($1, $2, $3, $4) RETURNING id`,
        [t.id, title, qiraat, riwayat],
      )
    ).id,
  );
}

async function edge(t: T, chainId: string, source: string, target: string) {
  return as(db, 'authenticated', t.uid, async () =>
    (
      await q1<{ id: string }>(
        `INSERT INTO sanad_edges (sanad_chain_id, source_node_id, target_node_id, supporting_evidence, notes)
         VALUES ($1, $2, $3, 'BUKTI-SULIT', 'NOTA-SULIT') RETURNING id`,
        [chainId, source, target],
      )
    ).id,
  );
}

const admin = (sql: string, params: unknown[] = []) => as(db, 'authenticated', verifier, () => db.query(sql, params));

beforeAll(async () => {
  db = await createTestDatabase();
  verifier = await signUp(db, 'pengesah-sanad@ujian.test');
  await setRoleAsOwner(db, verifier, 'verification_admin');
  qiraat = (await q1<{ id: string }>(`SELECT id FROM qiraat_types WHERE code = 'Q05-ASIM'`)).id;
  riwayat = (await q1<{ id: string }>(`SELECT id FROM riwayat_types WHERE code = 'R-HAFS'`)).id;
  guru = await teacher('guru-sanad@ujian.test');
  other = await teacher('guru-lain@ujian.test');
});

describe('teacher self-node', () => {
  it('is created once, linked to the teacher, and starts as a draft', async () => {
    const again = await as(db, 'authenticated', guru.uid, async () => (await q1<{ n: string }>(`SELECT ensure_my_sanad_node() n`)).n);
    expect(again).toBe(guru.self);
    const n = await q1<{ linked_teacher_id: string; verification_status: string; is_public: boolean }>(
      `SELECT linked_teacher_id, verification_status, is_public FROM sanad_nodes WHERE id = $1`,
      [guru.self],
    );
    expect(n).toEqual({ linked_teacher_id: guru.id, verification_status: 'draft', is_public: false });
  });

  it('cannot be created by anonymous visitors', async () => {
    await expect(as(db, 'anon', null, () => db.query(`SELECT ensure_my_sanad_node()`))).rejects.toThrow(/permission denied/);
  });
});

describe('building a chain', () => {
  let c: string;
  let top: string;
  let shaykh: string;

  beforeAll(async () => {
    c = await chain(guru);
    top = await node(guru, 'Syeikh Atas Ujian', 'الشيخ الأعلى');
    shaykh = await node(guru, 'Syeikh Langsung Ujian', 'الشيخ المباشر');
  });

  it('forces new chains, nodes and edges into a private draft state', async () => {
    const ch = await q1<{ verification_status: string; is_public: boolean; sanad_code: string }>(
      `SELECT verification_status, is_public, sanad_code FROM sanad_chains WHERE id = $1`,
      [c],
    );
    expect(ch.verification_status).toBe('draft');
    expect(ch.sanad_code).toMatch(/^SND-\d{6}$/);
    await expect(
      as(db, 'authenticated', guru.uid, () =>
        db.query(`INSERT INTO sanad_chains (teacher_id, title, qiraat_id, riwayat_id, verification_status) VALUES ($1, 'x', $2, $3, 'submitted')`, [
          guru.id,
          qiraat,
          riwayat,
        ]),
      ),
    ).rejects.toThrow(/draf/);
  });

  it('supports branching: two shaykhs teaching the same student', async () => {
    await edge(guru, c, top, shaykh);
    await edge(guru, c, shaykh, guru.self);
    const second = await node(guru, 'Syeikh Cabang Ujian');
    await edge(guru, c, second, guru.self);
    const count = await q1<{ n: number }>(`SELECT count(*)::int n FROM sanad_edges WHERE sanad_chain_id = $1`, [c]);
    expect(count.n).toBe(3);
  });

  it('rejects cycles and duplicate relationships', async () => {
    await expect(edge(guru, c, guru.self, top)).rejects.toThrow(/kitaran/);
    await expect(edge(guru, c, top, shaykh)).rejects.toThrow(/duplicate key/);
    await expect(edge(guru, c, top, top)).rejects.toThrow(/check constraint|kitaran/);
  });

  it("cannot link another teacher's private node (no silent merging)", async () => {
    const foreign = await node(other, 'Syeikh Milik Orang Lain');
    await expect(edge(guru, c, foreign, guru.self)).rejects.toThrow(/tidak boleh digunakan/);
  });

  it('lists similar existing nodes for an explicit choice, never merging them', async () => {
    await node(guru, 'Syeikh Atas Ujian'); // same name, separate record: allowed
    const rows = await as(db, 'authenticated', guru.uid, async () =>
      (await db.query<{ id: string; full_name_rumi: string; is_mine: boolean }>(`SELECT * FROM search_linkable_sanad_nodes('syeikh atas')`)).rows,
    );
    expect(rows.filter((r) => r.full_name_rumi === 'Syeikh Atas Ujian')).toHaveLength(2);
    expect(rows.every((r) => r.is_mine)).toBe(true);
    const arabic = await as(db, 'authenticated', guru.uid, async () =>
      (await db.query<{ id: string }>(`SELECT id FROM search_linkable_sanad_nodes('الشيخ المباشر')`)).rows,
    );
    expect(arabic.map((r) => r.id)).toContain(shaykh);
    const foreignVisible = await as(db, 'authenticated', guru.uid, async () =>
      (await db.query(`SELECT id FROM search_linkable_sanad_nodes('milik orang lain')`)).rows,
    );
    expect(foreignVisible).toEqual([]);
  });

  it('refuses to submit a chain with a transmitter that does not lead to the teacher', async () => {
    const loose1 = await node(guru, 'Perawi Terasing A');
    const loose2 = await node(guru, 'Perawi Terasing B');
    const looseEdge = await edge(guru, c, loose1, loose2);
    await expect(as(db, 'authenticated', guru.uid, () => db.query(`SELECT submit_my_sanad_chain($1)`, [c]))).rejects.toThrow(
      /2 perawi yang tidak bersambung/,
    );
    await as(db, 'authenticated', guru.uid, () => db.query(`DELETE FROM sanad_edges WHERE id = $1`, [looseEdge]));
  });

  it('refuses to submit a chain that does not end with the teacher', async () => {
    const c2 = await chain(guru, 'Sanad Tanpa Akhir');
    const a = await node(guru, 'Perawi A Tanpa Akhir');
    const b = await node(guru, 'Perawi B Tanpa Akhir');
    await edge(guru, c2, a, b);
    await expect(as(db, 'authenticated', guru.uid, () => db.query(`SELECT submit_my_sanad_chain($1)`, [c2]))).rejects.toThrow(
      /berakhir dengan diri anda/,
    );
  });

  it('submits atomically with depth, direct shaykh, snapshot and review request', async () => {
    await as(db, 'authenticated', guru.uid, () => db.query(`SELECT submit_my_sanad_chain($1, 'Mohon semakan')`, [c]));
    const ch = await q1<{ verification_status: string; generation_depth: number; immediate_teacher_name_rumi: string }>(
      `SELECT verification_status, generation_depth, immediate_teacher_name_rumi FROM sanad_chains WHERE id = $1`,
      [c],
    );
    expect(ch.verification_status).toBe('submitted');
    expect(ch.generation_depth).toBe(2);
    expect(['Syeikh Langsung Ujian', 'Syeikh Cabang Ujian']).toContain(ch.immediate_teacher_name_rumi);

    const edges = await db.query<{ s: string }>(`SELECT DISTINCT verification_status s FROM sanad_edges WHERE sanad_chain_id = $1`, [c]);
    expect(edges.rows).toEqual([{ s: 'submitted' }]);
    const nodeStatus = await q1<{ s: string }>(`SELECT verification_status s FROM sanad_nodes WHERE id = $1`, [shaykh]);
    expect(nodeStatus.s).toBe('submitted');

    const rev = await db.query<{ revision_no: number; reason: string; snapshot: { edges: unknown[]; chain: Record<string, unknown> } }>(
      `SELECT revision_no, reason, snapshot FROM sanad_chain_revisions WHERE sanad_chain_id = $1`,
      [c],
    );
    expect(rev.rows).toHaveLength(1);
    expect(rev.rows[0].reason).toBe('submitted');
    expect(rev.rows[0].snapshot.edges).toHaveLength(3);
    expect(rev.rows[0].snapshot.chain).not.toHaveProperty('internal_notes');

    const sub = await q1<{ status: string }>(`SELECT status FROM verification_submissions WHERE target_type = 'sanad_chain' AND target_record_id = $1`, [c]);
    expect(sub.status).toBe('submitted');
  });

  it('locks the chain, its edges and its nodes once submitted', async () => {
    const extra = await node(guru, 'Perawi Selepas Hantar');
    await expect(edge(guru, c, extra, top)).rejects.toThrow(/tidak boleh disunting/);
    await expect(as(db, 'authenticated', guru.uid, () => db.query(`UPDATE sanad_chains SET title = 'Baharu' WHERE id = $1`, [c]))).rejects.toThrow(
      /Tarik balik atau cipta semakan/,
    );
    await expect(as(db, 'authenticated', guru.uid, () => db.query(`DELETE FROM sanad_chains WHERE id = $1`, [c]))).rejects.toThrow(/tidak boleh dipadam/);
    await expect(as(db, 'authenticated', guru.uid, () => db.query(`DELETE FROM sanad_edges WHERE sanad_chain_id = $1`, [c]))).rejects.toThrow(
      /tidak boleh disunting/,
    );
    await expect(
      as(db, 'authenticated', guru.uid, () => db.query(`UPDATE sanad_nodes SET biography = 'ubah' WHERE id = $1`, [shaykh])),
    ).rejects.toThrow(/tidak boleh disunting/);
    await expect(
      as(db, 'authenticated', guru.uid, () => db.query(`UPDATE sanad_chains SET verification_status = 'approved' WHERE id = $1`, [c])),
    ).rejects.toThrow(/penghantaran rasmi/);
  });

  it('can be withdrawn and edited again, with history recorded', async () => {
    await as(db, 'authenticated', guru.uid, () => db.query(`SELECT withdraw_my_sanad_chain($1)`, [c]));
    await as(db, 'authenticated', guru.uid, () => db.query(`UPDATE sanad_chains SET title = 'Sanad Hafs Ujian (dikemas kini)' WHERE id = $1`, [c]));
    const revs = await db.query<{ reason: string }>(`SELECT reason FROM sanad_chain_revisions WHERE sanad_chain_id = $1 ORDER BY revision_no`, [c]);
    expect(revs.rows.map((r) => r.reason)).toEqual(['submitted', 'withdrawn']);
    const sub = await q1<{ status: string }>(`SELECT status FROM verification_submissions WHERE target_record_id = $1`, [c]);
    expect(sub.status).toBe('draft');
    await as(db, 'authenticated', guru.uid, () => db.query(`SELECT submit_my_sanad_chain($1)`, [c]));
  });

  it('revisions of an approved chain are separate drafts; the original stays public', async () => {
    await admin(`UPDATE teachers SET profile_verification_status = 'published', is_published = TRUE WHERE id = $1`, [guru.id]);
    await admin(`UPDATE sanad_chains SET verification_status = 'approved', is_public = TRUE WHERE id = $1`, [c]);
    const revision = await as(db, 'authenticated', guru.uid, async () => (await q1<{ r: string }>(`SELECT revise_my_sanad_chain($1) r`, [c])).r);
    const copy = await q1<{ verification_status: string; supersedes_chain_id: string; is_public: boolean }>(
      `SELECT verification_status, supersedes_chain_id, is_public FROM sanad_chains WHERE id = $1`,
      [revision],
    );
    expect(copy).toEqual({ verification_status: 'draft', supersedes_chain_id: c, is_public: false });
    const copied = await q1<{ n: number }>(`SELECT count(*)::int n FROM sanad_edges WHERE sanad_chain_id = $1`, [revision]);
    expect(copied.n).toBe(3);
    await expect(as(db, 'authenticated', guru.uid, () => db.query(`SELECT revise_my_sanad_chain($1)`, [c]))).rejects.toThrow(/sudah wujud/);
    const original = await as(db, 'anon', null, async () => (await db.query(`SELECT id FROM v_public_sanad_chains WHERE id = $1`, [c])).rows);
    expect(original).toHaveLength(1);
  });

  it('keeps revision history private to the owner and administrators', async () => {
    const own = await as(db, 'authenticated', guru.uid, async () => (await db.query(`SELECT id FROM sanad_chain_revisions`)).rows);
    const foreign = await as(db, 'authenticated', other.uid, async () => (await db.query(`SELECT id FROM sanad_chain_revisions`)).rows);
    const anon = await as(db, 'anon', null, async () => (await db.query(`SELECT id FROM sanad_chain_revisions`)).rows);
    expect(own.length).toBeGreaterThan(0);
    expect(foreign).toEqual([]);
    expect(anon).toEqual([]);
  });
});

describe('public graph', () => {
  let c: string;
  let a: string;
  let b: string;
  let approvedEdge: string;
  let pendingEdge: string;
  let pub: T;

  beforeAll(async () => {
    pub = await teacher('guru-graf@ujian.test');
    c = await chain(pub, 'Sanad Graf Awam');
    a = await node(pub, 'Syeikh Graf A', 'الشيخ أ');
    b = await node(pub, 'Syeikh Graf B', 'الشيخ ب');
    approvedEdge = await edge(pub, c, a, pub.self);
    pendingEdge = await edge(pub, c, b, pub.self);
    await admin(`UPDATE teachers SET profile_verification_status = 'published', is_published = TRUE WHERE id = $1`, [pub.id]);
    await admin(`UPDATE sanad_chains SET verification_status = 'approved', is_public = TRUE, allow_public_graph_export = TRUE WHERE id = $1`, [c]);
    await admin(`UPDATE sanad_nodes SET verification_status = 'approved', is_public = TRUE WHERE id IN ($1, $2, $3)`, [a, b, pub.self]);
    await admin(`UPDATE sanad_edges SET verification_status = 'approved', is_public = TRUE WHERE id = $1`, [approvedEdge]);
    // pendingEdge is left unapproved on purpose.
  });

  async function graph(args: { chain?: string; teacher?: string } = {}) {
    return as(db, 'anon', null, async () =>
      (await q1<{ g: { chains: Array<Record<string, unknown>>; nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> } }>(
        `SELECT get_public_sanad_graph(p_chain_id => $1, p_teacher_id => $2) g`,
        [args.chain ?? null, args.teacher ?? null],
      )).g,
    );
  }

  it('contains only approved public edges between approved public nodes', async () => {
    const g = await graph({ chain: c });
    expect(g.edges.map((e) => e.id)).toEqual([approvedEdge]);
    expect(g.edges.map((e) => e.id)).not.toContain(pendingEdge);
    expect(g.nodes.map((n) => n.full_name_rumi).sort()).toEqual(['Guru Ujian Sanad', 'Syeikh Graf A']);
  });

  it('never exposes evidence, notes or internal fields', async () => {
    const text = JSON.stringify(await graph({ chain: c }));
    expect(text).not.toContain('BUKTI-SULIT');
    expect(text).not.toContain('NOTA-SULIT');
    expect(text).not.toContain('internal_notes');
    expect(text).not.toContain('created_by');
  });

  it('respects the export permission of both chain and teacher', async () => {
    let g = await graph({ chain: c });
    expect(g.chains[0].allow_export).toBe(false); // teacher has not allowed downloads
    await db.query(`INSERT INTO teacher_public_settings (teacher_id, allow_graph_download) VALUES ($1, TRUE)`, [pub.id]);
    g = await graph({ chain: c });
    expect(g.chains[0].allow_export).toBe(true);
  });

  it('hides the graph when the teacher turns it off', async () => {
    await db.query(`UPDATE teacher_public_settings SET show_sanad_graph = FALSE WHERE teacher_id = $1`, [pub.id]);
    const g = await graph({ chain: c });
    expect(g).toEqual({ chains: [], nodes: [], edges: [] });
    await db.query(`UPDATE teacher_public_settings SET show_sanad_graph = TRUE WHERE teacher_id = $1`, [pub.id]);
  });

  it('links a node to a teacher profile only when that profile is public', async () => {
    const g = await graph({ chain: c });
    const self = g.nodes.find((n) => n.full_name_rumi === 'Guru Ujian Sanad');
    expect(self?.linked_teacher_id).toBe(pub.id);
  });
});

describe('search normalisation parity', () => {
  it('TypeScript normalizeSearchText matches the SQL function', async () => {
    const { normalizeSearchText } = await import('@/lib/text/normalize');
    const samples = ['ABDULLAH  Bin-Ismail', 'عَبْدُ ٱللَّهِ', "Nafi'", 'مدرسة الإمام', 'Ibn al-Jazari (w. 833H)', 'إسماعيل_علي', 'Musa  ‘Ali'];
    for (const s of samples) {
      const sql = await q1<{ n: string }>(`SELECT normalize_search_text($1) n`, [s]);
      expect(normalizeSearchText(s)).toBe(sql.n);
    }
  });
});
