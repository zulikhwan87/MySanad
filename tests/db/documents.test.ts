/**
 * Phase 5: document registration, deletion and access (migration 009). Fictional fixtures.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createTestDatabase, setRoleAsOwner, signUp, stateId } from './harness';

let db: PGlite;
let verifier: string;
let a: { uid: string; id: string };
let b: { uid: string; id: string };
let counter = 0;

async function teacher(email: string) {
  const uid = await signUp(db, email);
  const kel = await stateId(db, 'kelantan');
  const id = await as(db, 'authenticated', uid, async () =>
    (
      await db.query<{ id: string }>(
        `INSERT INTO teachers (profile_id, full_name_rumi, public_display_name, teaching_state_id) VALUES ($1, 'Guru Dokumen', 'Guru Dokumen', $2) RETURNING id`,
        [uid, kel],
      )
    ).rows[0].id,
  );
  return { uid, id };
}

function path(uid: string, ext = 'pdf') {
  counter += 1;
  return `${uid}/${String(counter).padStart(20, '0')}.${ext}`;
}

async function upload(uid: string, name: string, size = 2048) {
  await as(db, 'authenticated', uid, () =>
    db.query(`INSERT INTO storage.objects (bucket_id, name, metadata) VALUES ('private-ijazah-documents', $1, $2)`, [name, JSON.stringify({ size })]),
  );
}

async function register(uid: string, p: string, opts: { size?: number; filename?: string; chain?: string | null; ijazah?: string | null } = {}) {
  return as(db, 'authenticated', uid, async () =>
    (
      await db.query<{ id: string }>(
        `SELECT register_my_document($1, 'Sijil Ijazah Sanad', $2, 'application/pdf', $3, $4, $5, 'Sila semak') AS id`,
        [p, opts.filename ?? 'sijil.pdf', opts.size ?? 2048, opts.chain ?? null, opts.ijazah ?? null],
      )
    ).rows[0].id,
  );
}

beforeAll(async () => {
  db = await createTestDatabase();
  verifier = await signUp(db, 'pengesah-dok@ujian.test');
  await setRoleAsOwner(db, verifier, 'verification_admin');
  a = await teacher('dok-a@ujian.test');
  b = await teacher('dok-b@ujian.test');
});

describe('register_my_document', () => {
  it('creates a submitted document and its review request atomically', async () => {
    const p = path(a.uid);
    await upload(a.uid, p);
    const id = await register(a.uid, p);
    const doc = await db.query<{ review_status: string; storage_bucket: string }>(`SELECT review_status, storage_bucket FROM documents WHERE id = $1`, [id]);
    expect(doc.rows[0]).toEqual({ review_status: 'submitted', storage_bucket: 'private-ijazah-documents' });
    const sub = await db.query<{ status: string; applicant_notes: string }>(
      `SELECT status, applicant_notes FROM verification_submissions WHERE target_type = 'ijazah_document' AND target_record_id = $1`,
      [id],
    );
    expect(sub.rows[0]).toEqual({ status: 'submitted', applicant_notes: 'Sila semak' });
  });

  it('requires the file to have actually been uploaded', async () => {
    await expect(register(a.uid, path(a.uid))).rejects.toThrow(/tidak ditemui dalam storan/);
  });

  it('rejects a declared size that differs from the stored object', async () => {
    const p = path(a.uid);
    await upload(a.uid, p, 5000);
    await expect(register(a.uid, p, { size: 10 })).rejects.toThrow(/Saiz fail tidak sepadan/);
  });

  it("rejects paths outside the caller's folder or with unexpected names", async () => {
    await expect(register(b.uid, path(a.uid))).rejects.toThrow(/storan dokumen tidak sah/);
    await expect(register(a.uid, `${a.uid}/../${b.uid}/00000000000000000001.pdf`)).rejects.toThrow(/storan dokumen tidak sah/);
    await expect(register(a.uid, `${a.uid}/payload.exe`)).rejects.toThrow(/storan dokumen tidak sah/);
  });

  it("refuses to link another teacher's sanad chain or ijazah record (IDOR)", async () => {
    const qiraat = (await db.query<{ id: string }>(`SELECT id FROM qiraat_types WHERE code = 'Q05-ASIM'`)).rows[0].id;
    const riwayat = (await db.query<{ id: string }>(`SELECT id FROM riwayat_types WHERE code = 'R-HAFS'`)).rows[0].id;
    const chainOfB = await as(db, 'authenticated', b.uid, async () =>
      (await db.query<{ id: string }>(`INSERT INTO sanad_chains (teacher_id, title, qiraat_id, riwayat_id) VALUES ($1, 'Sanad B', $2, $3) RETURNING id`, [b.id, qiraat, riwayat]))
        .rows[0].id,
    );
    const ijazahOfB = await as(db, 'authenticated', b.uid, async () =>
      (await db.query<{ id: string }>(`INSERT INTO ijazah_records (teacher_id, ijazah_title, granting_sheikh_rumi) VALUES ($1, 'Ijazah B', 'Syeikh') RETURNING id`, [b.id]))
        .rows[0].id,
    );
    const p = path(a.uid);
    await upload(a.uid, p);
    await expect(register(a.uid, p, { chain: chainOfB })).rejects.toThrow(/bukan milik anda/);
    await expect(register(a.uid, p, { ijazah: ijazahOfB })).rejects.toThrow(/bukan milik anda/);

    // Linking one's own records works.
    const ownIjazah = await as(db, 'authenticated', a.uid, async () =>
      (await db.query<{ id: string }>(`INSERT INTO ijazah_records (teacher_id, ijazah_title, granting_sheikh_rumi) VALUES ($1, 'Ijazah A', 'Syeikh') RETURNING id`, [a.id]))
        .rows[0].id,
    );
    const id = await register(a.uid, p, { ijazah: ownIjazah });
    const doc = await db.query<{ ijazah_record_id: string }>(`SELECT ijazah_record_id FROM documents WHERE id = $1`, [id]);
    expect(doc.rows[0].ijazah_record_id).toBe(ownIjazah);
  });

  it('keeps only a safe display filename', async () => {
    const p = path(a.uid);
    await upload(a.uid, p);
    const id = await register(a.uid, p, { filename: '../../etc/pass\u0007wd\\sijil asal.pdf' });
    const doc = await db.query<{ original_filename: string }>(`SELECT original_filename FROM documents WHERE id = $1`, [id]);
    expect(doc.rows[0].original_filename).toBe('sijil asal.pdf');
  });

  it('enforces the per-teacher document limit', async () => {
    const c = await teacher('dok-had@ujian.test');
    await db.query(`CREATE OR REPLACE FUNCTION public.max_documents_per_teacher() RETURNS INT LANGUAGE sql IMMUTABLE AS $$ SELECT 2 $$`);
    for (let i = 0; i < 2; i += 1) {
      const p = path(c.uid);
      await upload(c.uid, p);
      await register(c.uid, p);
    }
    const p = path(c.uid);
    await upload(c.uid, p);
    await expect(register(c.uid, p)).rejects.toThrow(/Had 2 dokumen/);
    await db.query(`CREATE OR REPLACE FUNCTION public.max_documents_per_teacher() RETURNS INT LANGUAGE sql IMMUTABLE AS $$ SELECT 50 $$`);
  });

  it('cannot be called anonymously', async () => {
    await expect(as(db, 'anon', null, () => db.query(`SELECT register_my_document('x', 'Sijil Akademik', 'x', 'application/pdf', 1)`))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe('document access', () => {
  it('is visible to the owner and administrators only', async () => {
    const p = path(a.uid);
    await upload(a.uid, p);
    const id = await register(a.uid, p);
    const own = await as(db, 'authenticated', a.uid, async () => (await db.query(`SELECT id FROM documents WHERE id = $1`, [id])).rows);
    const other = await as(db, 'authenticated', b.uid, async () => (await db.query(`SELECT id FROM documents WHERE id = $1`, [id])).rows);
    const admin = await as(db, 'authenticated', verifier, async () => (await db.query(`SELECT id FROM documents WHERE id = $1`, [id])).rows);
    const anon = await as(db, 'anon', null, async () => (await db.query(`SELECT id FROM documents WHERE id = $1`, [id])).rows);
    expect(own).toHaveLength(1);
    expect(other).toEqual([]);
    expect(admin).toHaveLength(1);
    expect(anon).toEqual([]);
  });

  it('cannot be updated by the owner (review fields belong to administrators)', async () => {
    const p = path(a.uid);
    await upload(a.uid, p);
    const id = await register(a.uid, p);
    const res = await as(db, 'authenticated', a.uid, () => db.query(`UPDATE documents SET review_status = 'approved' WHERE id = $1`, [id]));
    expect(res.affectedRows).toBe(0);
  });
});

describe('delete_my_document', () => {
  it('deletes an unreviewed document, closes its request and returns the storage path', async () => {
    const p = path(a.uid);
    await upload(a.uid, p);
    const id = await register(a.uid, p);
    const returned = await as(db, 'authenticated', a.uid, async () =>
      (await db.query<{ p: string }>(`SELECT delete_my_document($1) AS p`, [id])).rows[0].p,
    );
    expect(returned).toBe(p);
    expect((await db.query(`SELECT 1 FROM documents WHERE id = $1`, [id])).rows).toHaveLength(0);
    const sub = await db.query<{ status: string }>(`SELECT status FROM verification_submissions WHERE target_record_id = $1`, [id]);
    expect(sub.rows[0].status).toBe('draft');
  });

  it('refuses documents under review or approved, and documents of others', async () => {
    const p = path(a.uid);
    await upload(a.uid, p);
    const id = await register(a.uid, p);
    await expect(as(db, 'authenticated', b.uid, () => db.query(`SELECT delete_my_document($1)`, [id]))).rejects.toThrow(/tidak ditemui/);
    await as(db, 'authenticated', verifier, () => db.query(`UPDATE documents SET review_status = 'under_review' WHERE id = $1`, [id]));
    await expect(as(db, 'authenticated', a.uid, () => db.query(`SELECT delete_my_document($1)`, [id]))).rejects.toThrow(/tidak boleh dipadam/);
  });
});
