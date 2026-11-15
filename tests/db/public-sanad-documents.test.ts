/**
 * Migration 012: public sanad certificates and Qiraat & Riwayat counts. Fictional fixtures only.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createTestDatabase, setRoleAsOwner, signUp, stateId } from './harness';

let db: PGlite;
let verifier: string;
let qiraat: string;
let riwayat: string;
let counter = 0;

interface T {
  uid: string;
  id: string;
}

async function teacher(email: string, published = true): Promise<T> {
  const uid = await signUp(db, email);
  const kel = await stateId(db, 'kelantan');
  const id = await as(db, 'authenticated', uid, async () =>
    (
      await db.query<{ id: string }>(
        `INSERT INTO teachers (profile_id, full_name_rumi, public_display_name, teaching_state_id, primary_qiraat_id, primary_riwayat_id)
         VALUES ($1, 'Guru Sijil', 'Guru Sijil', $2, $3, $4) RETURNING id`,
        [uid, kel, qiraat, riwayat],
      )
    ).rows[0].id,
  );
  if (published) {
    await db.query(`UPDATE teachers SET is_published = TRUE, profile_verification_status = 'published' WHERE id = $1`, [id]);
  }
  return { uid, id };
}

async function upload(t: T, opts: { show?: boolean; category?: string } = {}) {
  counter += 1;
  const p = `${t.uid}/${String(counter).padStart(20, '0')}.pdf`;
  await as(db, 'authenticated', t.uid, () =>
    db.query(`INSERT INTO storage.objects (bucket_id, name, metadata) VALUES ('private-ijazah-documents', $1, $2)`, [p, JSON.stringify({ size: 2048 })]),
  );
  const id = await as(db, 'authenticated', t.uid, async () =>
    (
      await db.query<{ id: string }>(
        `SELECT register_my_document($1, $2, 'sijil-rahsia-nama.pdf', 'application/pdf', 2048, NULL, NULL, NULL, $3) AS id`,
        [p, opts.category ?? 'Sijil Ijazah Sanad', opts.show ?? false],
      )
    ).rows[0].id,
  );
  return { id, path: p };
}

async function decide(docId: string, decision: 'approve' | 'reject', feedback: string | null = null) {
  const sub = (
    await db.query<{ id: string }>(
      `SELECT id FROM verification_submissions WHERE target_type = 'ijazah_document' AND target_record_id = $1 AND status IN ('submitted', 'under_review')`,
      [docId],
    )
  ).rows[0].id;
  await as(db, 'authenticated', verifier, () => db.query(`SELECT admin_decide_submission($1, $2, $3)`, [sub, decision, feedback]));
}

const publicDocs = (teacherId: string) =>
  as(db, 'anon', null, async () => (await db.query<Record<string, unknown>>(`SELECT * FROM get_public_sanad_documents($1)`, [teacherId])).rows);
const servicePath = (docId: string) =>
  as(db, 'service_role', null, async () => (await db.query<{ p: string | null }>(`SELECT public_sanad_document_path($1) p`, [docId])).rows[0].p);
const setPublic = (t: T, docId: string, show: boolean) =>
  as(db, 'authenticated', t.uid, async () => (await db.query<{ s: string }>(`SELECT set_my_document_public($1, $2) s`, [docId, show])).rows[0].s);

beforeAll(async () => {
  db = await createTestDatabase();
  verifier = await signUp(db, 'pengesah-sijil@ujian.test');
  await setRoleAsOwner(db, verifier, 'verification_admin');
  qiraat = (await db.query<{ id: string }>(`SELECT id FROM qiraat_types WHERE code = 'Q05-ASIM'`)).rows[0].id;
  riwayat = (await db.query<{ id: string }>(`SELECT id FROM riwayat_types WHERE code = 'R-HAFS'`)).rows[0].id;
});

describe('public sanad certificates', () => {
  it('shows a requested certificate only after approval, without private fields', async () => {
    const t = await teacher('sijil1@ujian.test');
    const doc = await upload(t, { show: true });
    expect(await publicDocs(t.id)).toEqual([]);
    expect(await servicePath(doc.id)).toBeNull();

    await decide(doc.id, 'approve');
    const rows = await publicDocs(t.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(doc.id);
    const json = JSON.stringify(rows);
    expect(json).not.toContain('sijil-rahsia-nama');
    expect(json).not.toContain(t.uid);
    expect(await servicePath(doc.id)).toBe(doc.path);
  });

  it('keeps approved certificates private unless the teacher asked', async () => {
    const t = await teacher('sijil2@ujian.test');
    const doc = await upload(t);
    await decide(doc.id, 'approve');
    expect(await publicDocs(t.id)).toEqual([]);
  });

  it('turning display on for an approved certificate sends it back for review', async () => {
    const t = await teacher('sijil3@ujian.test');
    const doc = await upload(t);
    await decide(doc.id, 'approve');
    expect(await setPublic(t, doc.id, true)).toBe('submitted');
    expect(await publicDocs(t.id)).toEqual([]);
    const open = await db.query(`SELECT 1 FROM verification_submissions WHERE target_record_id = $1 AND status = 'submitted'`, [doc.id]);
    expect(open.rows).toHaveLength(1);
    await decide(doc.id, 'approve');
    expect(await publicDocs(t.id)).toHaveLength(1);
  });

  it('turning display off hides it immediately', async () => {
    const t = await teacher('sijil4@ujian.test');
    const doc = await upload(t, { show: true });
    await decide(doc.id, 'approve');
    expect(await publicDocs(t.id)).toHaveLength(1);
    expect(await setPublic(t, doc.id, false)).toBe('approved');
    expect(await publicDocs(t.id)).toEqual([]);
    expect(await servicePath(doc.id)).toBeNull();
  });

  it('hides certificates of unpublished teachers and rejected documents', async () => {
    const hidden = await teacher('sijil5@ujian.test', false);
    const d1 = await upload(hidden, { show: true });
    await decide(d1.id, 'approve');
    expect(await publicDocs(hidden.id)).toEqual([]);

    const t = await teacher('sijil6@ujian.test');
    const d2 = await upload(t, { show: true });
    await decide(d2.id, 'reject', 'Sijil mengandungi No. MyKad.');
    expect(await publicDocs(t.id)).toEqual([]);
    await setPublic(t, d2.id, false);
    await expect(setPublic(t, d2.id, true)).rejects.toThrow(/tidak boleh dipaparkan/);
  });

  it('only sanad certificates may be public', async () => {
    const t = await teacher('sijil7@ujian.test');
    await expect(upload(t, { show: true, category: 'Sijil Akademik' })).rejects.toThrow(/Hanya Sijil Ijazah Sanad/);
    const doc = await upload(t, { category: 'Sijil Akademik' });
    await expect(setPublic(t, doc.id, true)).rejects.toThrow(/Hanya Sijil Ijazah Sanad/);
  });

  it('teachers cannot change another teacher’s document or write the flag directly', async () => {
    const owner = await teacher('sijil8@ujian.test');
    const other = await teacher('sijil9@ujian.test');
    const doc = await upload(owner);
    await expect(setPublic(other, doc.id, true)).rejects.toThrow(/tidak ditemui/);
    await as(db, 'authenticated', owner.uid, () => db.query(`UPDATE documents SET show_publicly = TRUE WHERE id = $1`, [doc.id]));
    const r = await db.query<{ show_publicly: boolean }>(`SELECT show_publicly FROM documents WHERE id = $1`, [doc.id]);
    expect(r.rows[0].show_publicly).toBe(false);
  });

  it('the storage-path function is closed to anon and signed-in users', async () => {
    await expect(as(db, 'anon', null, () => db.query(`SELECT public_sanad_document_path(gen_random_uuid())`))).rejects.toThrow(/permission denied/);
    await expect(
      as(db, 'authenticated', verifier, () => db.query(`SELECT public_sanad_document_path(gen_random_uuid())`)),
    ).rejects.toThrow(/permission denied/);
  });
});

describe('public_qiraat_riwayat_stats', () => {
  it('counts published teachers per qiraat and riwayat', async () => {
    const stats = await as(db, 'anon', null, async () => (await db.query<{ s: Array<Record<string, unknown>> }>(`SELECT public_qiraat_riwayat_stats() s`)).rows[0].s);
    const asim = stats.find((q) => q.code === 'Q05-ASIM') as { teacher_count: number; riwayat: Array<{ code: string; teacher_count: number }> };
    const published = Number((await db.query<{ n: string }>(`SELECT COUNT(*) n FROM v_public_teachers WHERE primary_qiraat_id = $1`, [qiraat])).rows[0].n);
    expect(published).toBeGreaterThan(0);
    expect(asim.teacher_count).toBe(published);
    expect(asim.riwayat.find((r) => r.code === 'R-HAFS')?.teacher_count).toBe(published);
    expect(stats.length).toBeGreaterThanOrEqual(8);
  });
});
