/**
 * Migration 017: reference chains. Fictional fixtures only.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createTestDatabase, setRoleAsOwner, signUp, stateId } from './harness';

let db: PGlite;
let admin: string;
let qiraat: string;
let riwayat: string;
let n = 0;

const one = async <R,>(sql: string, params: unknown[] = []) => (await db.query<R>(sql, params)).rows[0];
const asAdmin = <R,>(sql: string, params: unknown[] = []) => as(db, 'authenticated', admin, async () => (await db.query<R>(sql, params)).rows);

async function node(name: string) {
  const [r] = await asAdmin<{ id: string }>(`INSERT INTO sanad_nodes (full_name_rumi, full_name_arabic) VALUES ($1, '') RETURNING id`, [name]);
  return r.id;
}

/** root <- a <- b (b is the top). */
async function referenceChain(title = 'Rujukan Hafs') {
  const root = await node(`Syeikh Permulaan ${title}`);
  const a = await node(`Syeikh Tengah ${title}`);
  const b = await node(`Imam Atas ${title}`);
  const [rc] = await asAdmin<{ id: string }>(
    `INSERT INTO reference_chains (title, qiraat_id, riwayat_id, root_node_id) VALUES ($1, $2, $3, $4) RETURNING id`,
    [title, qiraat, riwayat, root],
  );
  await asAdmin(`INSERT INTO reference_chain_links (reference_chain_id, source_node_id, target_node_id) VALUES ($1, $2, $3), ($1, $4, $2)`, [
    rc.id,
    a,
    root,
    b,
  ]);
  return { id: rc.id, root, a, b };
}

async function teacherWithChain() {
  n += 1;
  const uid = await signUp(db, `guru-rujukan${n}@ujian.test`);
  const kel = await stateId(db, 'kelantan');
  return as(db, 'authenticated', uid, async () => {
    const t = (await one<{ id: string }>(`INSERT INTO teachers (profile_id, full_name_rumi, public_display_name, teaching_state_id) VALUES ($1, 'Guru Rujukan', 'Guru Rujukan', $2) RETURNING id`, [uid, kel])).id;
    const self = (await one<{ n: string }>(`SELECT ensure_my_sanad_node() n`)).n;
    const chain = (await one<{ id: string }>(`INSERT INTO sanad_chains (teacher_id, title, qiraat_id, riwayat_id) VALUES ($1, 'Sanad Saya', $2, $3) RETURNING id`, [t, qiraat, riwayat])).id;
    const shaykh = (await one<{ id: string }>(`INSERT INTO sanad_nodes (full_name_rumi, full_name_arabic) VALUES ('Syeikh Guru Saya', '') RETURNING id`)).id;
    await db.query(`INSERT INTO sanad_edges (sanad_chain_id, source_node_id, target_node_id) VALUES ($1, $2, $3)`, [chain, shaykh, self]);
    return { uid, id: t, self, chain, shaykh };
  });
}

beforeAll(async () => {
  db = await createTestDatabase();
  admin = await signUp(db, 'pentadbir-rujukan@ujian.test');
  await setRoleAsOwner(db, admin, 'verification_admin');
  qiraat = (await one<{ id: string }>(`SELECT id FROM qiraat_types WHERE code = 'Q05-ASIM'`)).id;
  riwayat = (await one<{ id: string }>(`SELECT id FROM riwayat_types WHERE code = 'R-HAFS'`)).id;
});

describe('administrators curate reference chains', () => {
  it('start as drafts that teachers cannot see or change', async () => {
    const rc = await referenceChain('Draf');
    expect((await one<{ s: string }>(`SELECT status s FROM reference_chains WHERE id = $1`, [rc.id])).s).toBe('draft');
    const t = await teacherWithChain();
    const seen = await as(db, 'authenticated', t.uid, async () => (await db.query(`SELECT id FROM reference_chains WHERE id = $1`, [rc.id])).rows);
    expect(seen).toEqual([]);
    await expect(
      as(db, 'authenticated', t.uid, () => db.query(`INSERT INTO reference_chains (title, root_node_id) VALUES ('Saya', $1)`, [t.shaykh])),
    ).rejects.toThrow(/row-level security/);
    await expect(as(db, 'authenticated', t.uid, () => db.query(`SELECT admin_set_reference_chain_status($1, 'active')`, [rc.id]))).rejects.toThrow(
      /Hanya pentadbir/,
    );
    const anon = await as(db, 'anon', null, async () => db.query(`SELECT id FROM reference_chains`).catch(() => ({ rows: [] })));
    expect(anon.rows).toEqual([]);
  });

  it('activation requires every perawi to connect, and locks the links until deactivated', async () => {
    const rc = await referenceChain('Aktif');
    const stray = await node('Perawi Terasing');
    const other = await node('Perawi Lain');
    await asAdmin(`INSERT INTO reference_chain_links (reference_chain_id, source_node_id, target_node_id) VALUES ($1, $2, $3)`, [rc.id, stray, other]);
    await expect(asAdmin(`SELECT admin_set_reference_chain_status($1, 'active')`, [rc.id])).rejects.toThrow(/tidak bersambung/);
    await asAdmin(`DELETE FROM reference_chain_links WHERE reference_chain_id = $1 AND source_node_id = $2`, [rc.id, stray]);

    await asAdmin(`SELECT admin_set_reference_chain_status($1, 'active')`, [rc.id]);
    const nodes = await db.query<{ s: string; p: boolean }>(`SELECT verification_status s, is_public p FROM sanad_nodes WHERE id IN ($1, $2, $3)`, [rc.root, rc.a, rc.b]);
    expect(nodes.rows.every((r) => r.s === 'approved' && r.p)).toBe(true);
    await expect(asAdmin(`DELETE FROM reference_chain_links WHERE reference_chain_id = $1`, [rc.id])).rejects.toThrow(/Nyahaktifkan/);
    await expect(asAdmin(`UPDATE reference_chains SET status = 'draft' WHERE id = $1`, [rc.id])).rejects.toThrow(/Aktifkan/);

    await asAdmin(`SELECT admin_set_reference_chain_status($1, 'inactive')`, [rc.id]);
    await asAdmin(`DELETE FROM reference_chain_links WHERE reference_chain_id = $1 AND source_node_id = $2`, [rc.id, rc.b]);
  });

  it('can start from the upper part of an approved chain', async () => {
    const t = await teacherWithChain();
    const top = await as(db, 'authenticated', t.uid, async () => {
      const id = (await one<{ id: string }>(`INSERT INTO sanad_nodes (full_name_rumi, full_name_arabic) VALUES ('Syeikh Atas Guru', '') RETURNING id`)).id;
      await db.query(`INSERT INTO sanad_edges (sanad_chain_id, source_node_id, target_node_id) VALUES ($1, $2, $3)`, [t.chain, id, t.shaykh]);
      return id;
    });
    await expect(asAdmin(`SELECT admin_create_reference_from_chain('X', $1, $2)`, [t.chain, t.shaykh])).rejects.toThrow(/diluluskan/);
    await asAdmin(`UPDATE sanad_chains SET verification_status = 'approved' WHERE id = $1`, [t.chain]);
    const [{ id }] = await asAdmin<{ id: string }>(`SELECT admin_create_reference_from_chain('Salinan Hafs', $1, $2) id`, [t.chain, t.shaykh]);
    const rc = await one<{ status: string; root_node_id: string }>(`SELECT status, root_node_id FROM reference_chains WHERE id = $1`, [id]);
    expect(rc).toEqual({ status: 'draft', root_node_id: t.shaykh });
    const links = await db.query<{ s: string; t: string }>(`SELECT source_node_id s, target_node_id t FROM reference_chain_links WHERE reference_chain_id = $1`, [id]);
    expect(links.rows).toEqual([{ s: top, t: t.shaykh }]);
  });
});

describe('teachers copy an active reference into their chain', () => {
  it('copies the chosen perawi and everything above; later changes to the reference do not touch the copy', async () => {
    const rc = await referenceChain('Salin');
    await asAdmin(`SELECT admin_set_reference_chain_status($1, 'active')`, [rc.id]);
    const t = await teacherWithChain();

    const visible = await as(db, 'authenticated', t.uid, async () => (await db.query(`SELECT id FROM reference_chain_links WHERE reference_chain_id = $1`, [rc.id])).rows);
    expect(visible).toHaveLength(2);

    const added = await as(db, 'authenticated', t.uid, async () =>
      (await one<{ n: number }>(`SELECT attach_reference_chain($1, $2, $3, $4) n`, [t.chain, t.shaykh, rc.id, rc.root])).n,
    );
    expect(added).toBe(3);
    const edges = async () =>
      (await db.query<{ s: string; t: string; v: string }>(`SELECT source_node_id s, target_node_id t, verification_status v FROM sanad_edges WHERE sanad_chain_id = $1`, [t.chain])).rows;
    expect((await edges()).every((e) => e.v === 'draft')).toBe(true);
    expect((await edges()).map((e) => e.s).sort()).toEqual([t.shaykh, rc.root, rc.a, rc.b].filter((x) => x !== t.shaykh).concat(t.shaykh).sort());

    // The teacher's chain can now be submitted.
    await as(db, 'authenticated', t.uid, () => db.query(`SELECT submit_my_sanad_chain($1)`, [t.chain]));

    await asAdmin(`SELECT admin_set_reference_chain_status($1, 'inactive')`, [rc.id]);
    await asAdmin(`DELETE FROM reference_chains WHERE id = $1`, [rc.id]);
    expect(await edges()).toHaveLength(4);
  });

  it('refuses locked chains, inactive references, and works only while the feature is on', async () => {
    const rc = await referenceChain('Suis');
    const t = await teacherWithChain();
    const attach = () => as(db, 'authenticated', t.uid, () => db.query(`SELECT attach_reference_chain($1, $2, $3, $4)`, [t.chain, t.shaykh, rc.id, rc.a]));
    await expect(attach()).rejects.toThrow(/tidak aktif/);
    await asAdmin(`SELECT admin_set_reference_chain_status($1, 'active')`, [rc.id]);

    await db.query(`UPDATE system_settings SET value = 'false' WHERE key = 'reference_chains_enabled'`);
    await expect(attach()).rejects.toThrow(/tidak diaktifkan/);
    const hidden = await as(db, 'authenticated', t.uid, async () => (await db.query(`SELECT id FROM reference_chains`)).rows);
    expect(hidden).toEqual([]);
    await db.query(`UPDATE system_settings SET value = 'true' WHERE key = 'reference_chains_enabled'`);

    const other = await teacherWithChain();
    await expect(
      as(db, 'authenticated', other.uid, () => db.query(`SELECT attach_reference_chain($1, $2, $3, $4)`, [t.chain, t.shaykh, rc.id, rc.a])),
    ).rejects.toThrow(/tidak ditemui/);

    await as(db, 'authenticated', t.uid, () => db.query(`SELECT attach_reference_chain($1, $2, $3, $4)`, [t.chain, t.shaykh, rc.id, rc.a]));
    await as(db, 'authenticated', t.uid, () => db.query(`SELECT submit_my_sanad_chain($1)`, [t.chain]));
    await expect(attach()).rejects.toThrow(/dikunci/);
  });
});
