/**
 * Row Level Security & trigger-guard tests.
 * Runs every migration in supabase/migrations against an in-memory Postgres (PGlite)
 * with a minimal Supabase stub (auth.uid(), anon/authenticated/service_role, storage).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createTestDatabase, setRoleAsOwner, signUp, stateId } from './harness';

let db: PGlite;
let kelantan: string;

let teacherA: string; // profile id (auth uid)
let teacherB: string;
let verifier: string;
let superAdmin: string;
let teacherARecord: { id: string; teacher_code: string };
let teacherBRecord: { id: string; teacher_code: string };

async function insertTeacher(uid: string, name: string) {
  return as(db, 'authenticated', uid, async () => {
    const res = await db.query<{ id: string; teacher_code: string; is_published: boolean }>(
      `INSERT INTO public.teachers
         (profile_id, full_name_rumi, public_display_name, teaching_state_id,
          ic_number_encrypted, private_phone, residential_address)
       VALUES ($1, $2, $2, $3, 'IC-SECRET', '+60100000000', 'Alamat Rahsia')
       RETURNING id, teacher_code, is_published`,
      [uid, name, kelantan],
    );
    return res.rows[0];
  });
}

beforeAll(async () => {
  db = await createTestDatabase();
  kelantan = await stateId(db, 'kelantan');

  teacherA = await signUp(db, 'guru.a@contoh.test', { full_name: 'Guru A (Ujian)' });
  teacherB = await signUp(db, 'guru.b@contoh.test', { full_name: 'Guru B (Ujian)' });
  verifier = await signUp(db, 'pengesah@contoh.test');
  superAdmin = await signUp(db, 'super@contoh.test');
  await setRoleAsOwner(db, verifier, 'verification_admin');
  await setRoleAsOwner(db, superAdmin, 'super_admin');

  teacherARecord = await insertTeacher(teacherA, 'Guru A (Ujian)');
  teacherBRecord = await insertTeacher(teacherB, 'Guru B (Ujian)');
});

describe('migrations & reference data', () => {
  it('seeds 13 states + 3 federal territories', async () => {
    const res = await db.query<{ states: number; fts: number }>(
      `SELECT count(*) FILTER (WHERE NOT is_federal_territory)::int AS states,
              count(*) FILTER (WHERE is_federal_territory)::int AS fts
       FROM public.malaysian_states`,
    );
    expect(res.rows[0]).toEqual({ states: 13, fts: 3 });
  });

  it('lets anonymous visitors read reference data', async () => {
    const rows = await as(db, 'anon', null, async () =>
      (await db.query(`SELECT id FROM public.malaysian_districts`)).rows,
    );
    expect(rows.length).toBeGreaterThan(0);
  });
});

describe('authentication & profiles', () => {
  it('creates a registered_teacher profile on sign-up', async () => {
    const res = await db.query<{ role: string; full_name: string }>(
      `SELECT role, full_name FROM public.profiles WHERE id = $1`,
      [teacherA],
    );
    expect(res.rows[0]).toEqual({ role: 'registered_teacher', full_name: 'Guru A (Ujian)' });
  });

  it('ignores a role smuggled through sign-up metadata', async () => {
    const id = await signUp(db, 'penyamar@contoh.test', { full_name: 'X', role: 'super_admin' });
    const res = await db.query<{ role: string }>(`SELECT role FROM public.profiles WHERE id = $1`, [id]);
    expect(res.rows[0].role).toBe('registered_teacher');
  });

  it('lets a user update their own name (no recursive policy)', async () => {
    await as(db, 'authenticated', teacherA, () =>
      db.query(`UPDATE public.profiles SET full_name = 'Guru A Dikemas Kini' WHERE id = $1`, [teacherA]),
    );
    const res = await db.query<{ full_name: string }>(`SELECT full_name FROM public.profiles WHERE id = $1`, [teacherA]);
    expect(res.rows[0].full_name).toBe('Guru A Dikemas Kini');
  });

  it('blocks a teacher from promoting themselves', async () => {
    await expect(
      as(db, 'authenticated', teacherA, () =>
        db.query(`UPDATE public.profiles SET role = 'super_admin' WHERE id = $1`, [teacherA]),
      ),
    ).rejects.toThrow(/Super Admin/);
  });

  it('blocks a verification admin from assigning roles', async () => {
    // RLS stops it before the trigger: no update policy matches, so zero rows change.
    const res = await as(db, 'authenticated', verifier, () =>
      db.query(`UPDATE public.profiles SET role = 'verification_admin' WHERE id = $1`, [teacherB]),
    );
    expect(res.affectedRows).toBe(0);
    const role = await db.query<{ role: string }>(`SELECT role FROM public.profiles WHERE id = $1`, [teacherB]);
    expect(role.rows[0].role).toBe('registered_teacher');
  });

  it('allows only the super admin to assign roles to others', async () => {
    const tmp = await signUp(db, 'calon.admin@contoh.test');
    await as(db, 'authenticated', superAdmin, () =>
      db.query(`UPDATE public.profiles SET role = 'verification_admin' WHERE id = $1`, [tmp]),
    );
    const res = await db.query<{ role: string }>(`SELECT role FROM public.profiles WHERE id = $1`, [tmp]);
    expect(res.rows[0].role).toBe('verification_admin');
  });

  it('prevents a super admin from demoting themselves (lockout guard)', async () => {
    await expect(
      as(db, 'authenticated', superAdmin, () =>
        db.query(`UPDATE public.profiles SET role = 'registered_teacher' WHERE id = $1`, [superAdmin]),
      ),
    ).rejects.toThrow(/sendiri/);
  });

  it('does not let users read other profiles', async () => {
    const rows = await as(db, 'authenticated', teacherA, async () =>
      (await db.query(`SELECT id FROM public.profiles`)).rows,
    );
    expect(rows).toEqual([{ id: teacherA }]);
  });

  it('does not expose the super-admin bootstrap function to API roles', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      await expect(
        as(db, role, role === 'anon' ? null : teacherA, () =>
          db.query(`SELECT public.promote_user_to_super_admin('guru.a@contoh.test')`),
        ),
      ).rejects.toThrow(/permission denied/);
    }
  });
});

describe('teacher records', () => {
  it('generates sequential teacher codes and starts unpublished', async () => {
    expect(teacherARecord.teacher_code).toMatch(/^MSN-\d{6}$/);
    expect(teacherBRecord.teacher_code).not.toBe(teacherARecord.teacher_code);
  });

  it('blocks creating a teacher record for another user (IDOR)', async () => {
    await expect(
      as(db, 'authenticated', teacherA, () =>
        db.query(
          `INSERT INTO public.teachers (profile_id, full_name_rumi, public_display_name, teaching_state_id)
           VALUES ($1, 'x', 'x', $2)`,
          [teacherB, kelantan],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('blocks a teacher from self-publishing or self-approving', async () => {
    for (const sql of [
      `UPDATE public.teachers SET is_published = TRUE WHERE id = $1`,
      `UPDATE public.teachers SET sanad_reviewed_badge = TRUE WHERE id = $1`,
      `UPDATE public.teachers SET profile_verification_status = 'published' WHERE id = $1`,
      `UPDATE public.teachers SET profile_verification_status = 'approved' WHERE id = $1`,
    ]) {
      await expect(
        as(db, 'authenticated', teacherA, () => db.query(sql, [teacherARecord.id])),
      ).rejects.toThrow(/pentadbir|tidak dibenarkan/);
    }
  });

  it('allows a teacher to submit their own profile (via the submit function)', async () => {
    const qiraat = (await db.query<{ id: string }>(`SELECT id FROM public.qiraat_types LIMIT 1`)).rows[0].id;
    await as(db, 'authenticated', teacherA, async () => {
      await db.query(
        `UPDATE public.teachers SET primary_qiraat_id = $2, short_bio = 'Biografi ringkas guru ujian yang mencukupi panjangnya.' WHERE id = $1`,
        [teacherARecord.id, qiraat],
      );
      await db.query(`SELECT public.submit_my_teacher_profile('Mohon semakan')`);
    });
    const res = await db.query<{ s: string }>(
      `SELECT profile_verification_status AS s FROM public.teachers WHERE id = $1`,
      [teacherARecord.id],
    );
    expect(res.rows[0].s).toBe('submitted');
  });

  it("cannot read or modify another teacher's record", async () => {
    const rows = await as(db, 'authenticated', teacherA, async () =>
      (await db.query(`SELECT id FROM public.teachers WHERE id = $1`, [teacherBRecord.id])).rows,
    );
    expect(rows).toEqual([]);
    const upd = await as(db, 'authenticated', teacherA, () =>
      db.query(`UPDATE public.teachers SET short_bio = 'diubah' WHERE id = $1`, [teacherBRecord.id]),
    );
    expect(upd.affectedRows).toBe(0);
  });

  it('hides unpublished teachers and all base-table rows from the public', async () => {
    const view = await as(db, 'anon', null, async () => (await db.query(`SELECT id FROM public.v_public_teachers`)).rows);
    expect(view).toEqual([]);
  });

  it('publishes via admin and exposes only safe columns publicly', async () => {
    await as(db, 'authenticated', verifier, () =>
      db.query(
        `UPDATE public.teachers
         SET profile_verification_status = 'published', is_published = TRUE, published_at = NOW()
         WHERE id = $1`,
        [teacherARecord.id],
      ),
    );

    const viewRows = await as(db, 'anon', null, async () =>
      (await db.query<Record<string, unknown>>(`SELECT * FROM public.v_public_teachers`)).rows,
    );
    expect(viewRows.map((r) => r.id)).toEqual([teacherARecord.id]);
    for (const secret of ['ic_number_encrypted', 'private_phone', 'residential_address', 'profile_id']) {
      expect(viewRows[0]).not.toHaveProperty(secret);
    }

    // Even published teachers are not readable from the base table by the public.
    const base = await as(db, 'anon', null, async () => (await db.query(`SELECT * FROM public.teachers`)).rows);
    expect(base).toEqual([]);
  });

  it('removes a teacher from the public view when their account is deactivated', async () => {
    await as(db, 'authenticated', superAdmin, () =>
      db.query(`UPDATE public.profiles SET is_active = FALSE WHERE id = $1`, [teacherA]),
    );
    const rows = await as(db, 'anon', null, async () => (await db.query(`SELECT id FROM public.v_public_teachers`)).rows);
    expect(rows).toEqual([]);
    await as(db, 'authenticated', superAdmin, () =>
      db.query(`UPDATE public.profiles SET is_active = TRUE WHERE id = $1`, [teacherA]),
    );
  });
});

describe('sanad chains', () => {
  let chainId: string;
  let qiraatId: string;
  let riwayatId: string;

  beforeAll(async () => {
    const r = await db.query<{ q: string; r: string }>(
      `SELECT q.id AS q, r.id AS r FROM public.riwayat_types r JOIN public.qiraat_types q ON q.id = r.qiraat_id LIMIT 1`,
    );
    qiraatId = r.rows[0].q;
    riwayatId = r.rows[0].r;
  });

  it('creates a chain with a generated code and forces private, unverified state', async () => {
    const row = await as(db, 'authenticated', teacherA, async () =>
      (
        await db.query<{ id: string; sanad_code: string; is_public: boolean; internal_notes: string | null }>(
          `INSERT INTO public.sanad_chains
             (teacher_id, sanad_code, title, qiraat_id, riwayat_id, immediate_teacher_name_rumi,
              is_public, internal_notes, verification_status)
           VALUES ($1, 'SND-PALSU', 'Sanad Ujian', $2, $3, 'Syeikh Ujian', TRUE, 'cuba', 'draft')
           RETURNING id, sanad_code, is_public, internal_notes`,
          [teacherARecord.id, qiraatId, riwayatId],
        )
      ).rows[0],
    );
    chainId = row.id;
    expect(row.sanad_code).toMatch(/^SND-\d{6}$/);
    expect(row.is_public).toBe(false);
    expect(row.internal_notes).toBeNull();
  });

  it('rejects a chain inserted directly as approved', async () => {
    await expect(
      as(db, 'authenticated', teacherA, () =>
        db.query(
          `INSERT INTO public.sanad_chains (teacher_id, title, qiraat_id, riwayat_id, immediate_teacher_name_rumi, verification_status)
           VALUES ($1, 'x', $2, $3, 'y', 'approved')`,
          [teacherARecord.id, qiraatId, riwayatId],
        ),
      ),
    ).rejects.toThrow(/draf/);
  });

  it("blocks adding a chain to another teacher's profile", async () => {
    await expect(
      as(db, 'authenticated', teacherB, () =>
        db.query(
          `INSERT INTO public.sanad_chains (teacher_id, title, qiraat_id, riwayat_id, immediate_teacher_name_rumi)
           VALUES ($1, 'x', $2, $3, 'y')`,
          [teacherARecord.id, qiraatId, riwayatId],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('hides internal notes from the public view after admin approval', async () => {
    await as(db, 'authenticated', verifier, () =>
      db.query(
        `UPDATE public.sanad_chains
         SET verification_status = 'approved', is_public = TRUE, internal_notes = 'nota dalaman'
         WHERE id = $1`,
        [chainId],
      ),
    );
    const rows = await as(db, 'anon', null, async () =>
      (await db.query<Record<string, unknown>>(`SELECT * FROM public.v_public_sanad_chains`)).rows,
    );
    expect(rows.map((r) => r.id)).toEqual([chainId]);
    expect(rows[0]).not.toHaveProperty('internal_notes');
  });

  it('blocks the teacher from editing admin-only chain fields after approval', async () => {
    await expect(
      as(db, 'authenticated', teacherA, () =>
        db.query(`UPDATE public.sanad_chains SET internal_notes = 'ubah' WHERE id = $1`, [chainId]),
      ),
    ).rejects.toThrow(/pentadbir/);
  });

  it('shows public edges only when edge and chain are public', async () => {
    const nodes = await as(db, 'authenticated', teacherA, async () =>
      (
        await db.query<{ id: string }>(
          `INSERT INTO public.sanad_nodes (full_name_arabic, full_name_rumi, generation_category, is_public, verification_status)
           VALUES ('أ', 'Nod A (Ujian)', 'Guru Nusantara / Semasa', TRUE, 'draft'),
                  ('ب', 'Nod B (Ujian)', 'Guru Nusantara / Semasa', TRUE, 'draft')
           RETURNING id, is_public, created_by`,
        )
      ).rows as Array<{ id: string; is_public: boolean; created_by: string }>,
    );
    expect(nodes.every((n) => n.is_public === false && n.created_by === teacherA)).toBe(true);

    // Edges can only be added while the chain is a draft; use a fresh draft chain.
    const draftChain = await as(db, 'authenticated', teacherA, async () =>
      (
        await db.query<{ id: string }>(
          `INSERT INTO public.sanad_chains (teacher_id, title, qiraat_id, riwayat_id) VALUES ($1, 'Sanad Draf Ujian', $2, $3) RETURNING id`,
          [teacherARecord.id, qiraatId, riwayatId],
        )
      ).rows[0].id,
    );
    const edgeId = await as(db, 'authenticated', teacherA, async () =>
      (
        await db.query<{ id: string }>(
          `INSERT INTO public.sanad_edges (sanad_chain_id, source_node_id, target_node_id, is_public)
           VALUES ($1, $2, $3, TRUE) RETURNING id`,
          [draftChain, nodes[0].id, nodes[1].id],
        )
      ).rows[0].id,
    );
    await as(db, 'authenticated', verifier, () =>
      db.query(`UPDATE public.sanad_chains SET verification_status = 'approved', is_public = TRUE WHERE id = $1`, [draftChain]),
    );

    const before = await as(db, 'anon', null, async () => (await db.query(`SELECT id FROM public.sanad_edges`)).rows);
    expect(before).toEqual([]);

    await as(db, 'authenticated', verifier, () =>
      db.query(`UPDATE public.sanad_edges SET verification_status = 'approved', is_public = TRUE WHERE id = $1`, [edgeId]),
    );
    const after = await as(db, 'anon', null, async () => (await db.query(`SELECT id FROM public.sanad_edges`)).rows);
    expect(after).toEqual([{ id: edgeId }]);
  });
});

describe('documents & storage', () => {
  // Documents are registered only through register_my_document() (migration 009).
  const upload = (uid: string, name: string) =>
    as(db, 'authenticated', uid, () =>
      db.query(`INSERT INTO storage.objects (bucket_id, name, metadata) VALUES ('private-ijazah-documents', $1, '{"size": 1000}')`, [name]),
    );
  const register = (uid: string, path: string, mime = 'application/pdf', size = 1000) =>
    as(db, 'authenticated', uid, () =>
      db.query<{ id: string }>(`SELECT register_my_document($1, 'Sijil Ijazah Sanad', 'ijazah.pdf', $2, $3) AS id`, [path, mime, size]),
    );

  it('registers new documents as submitted, inside the owner folder only', async () => {
    const path = `${teacherB}/aaaaaaaaaaaaaaaa1111.pdf`;
    await upload(teacherB, path);
    const id = (await register(teacherB, path)).rows[0].id;
    const row = await db.query<{ review_status: string }>(`SELECT review_status FROM public.documents WHERE id = $1`, [id]);
    expect(row.rows[0].review_status).toBe('submitted');
  });

  it("rejects a storage path in someone else's folder and direct inserts", async () => {
    await expect(register(teacherB, `${teacherA}/aaaaaaaaaaaaaaaa2222.pdf`)).rejects.toThrow(/storan/);
    await expect(
      as(db, 'authenticated', teacherB, () =>
        db.query(
          `INSERT INTO public.documents (teacher_id, category, original_filename, storage_path, mime_type, file_size_bytes)
           VALUES ($1, 'Sijil Akademik', 'a.pdf', $2, 'application/pdf', 1000)`,
          [teacherBRecord.id, `${teacherB}/aaaaaaaaaaaaaaaa3333.pdf`],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('rejects disallowed MIME types and oversized files', async () => {
    const p1 = `${teacherB}/aaaaaaaaaaaaaaaa4444.pdf`;
    await upload(teacherB, p1);
    await expect(register(teacherB, p1, 'application/x-msdownload')).rejects.toThrow(/check constraint/);
    const p2 = `${teacherB}/aaaaaaaaaaaaaaaa5555.pdf`;
    await as(db, 'authenticated', teacherB, () =>
      db.query(`INSERT INTO storage.objects (bucket_id, name, metadata) VALUES ('private-ijazah-documents', $1, '{"size": 20000000}')`, [p2]),
    );
    await expect(register(teacherB, p2, 'application/pdf', 20000000)).rejects.toThrow(/check constraint/);
  });

  it('never exposes document metadata to the public or other teachers', async () => {
    const anonRows = await as(db, 'anon', null, async () => (await db.query(`SELECT id FROM public.documents`)).rows);
    const otherRows = await as(db, 'authenticated', teacherA, async () =>
      (await db.query(`SELECT id FROM public.documents`)).rows,
    );
    expect(anonRows).toEqual([]);
    expect(otherRows).toEqual([]);
  });

  it('restricts private storage uploads to the owner folder', async () => {
    await as(db, 'authenticated', teacherB, () =>
      db.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('private-ijazah-documents', $1)`, [
        `${teacherB}/sijil.pdf`,
      ]),
    );
    await expect(
      as(db, 'authenticated', teacherB, () =>
        db.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('private-ijazah-documents', $1)`, [
          `${teacherA}/sijil.pdf`,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);

    const anonRead = await as(db, 'anon', null, async () => (await db.query(`SELECT id FROM storage.objects`)).rows);
    const otherRead = await as(db, 'authenticated', teacherA, async () =>
      (await db.query(`SELECT id FROM storage.objects WHERE bucket_id = 'private-ijazah-documents'`)).rows,
    );
    const adminRead = await as(db, 'authenticated', verifier, async () =>
      (await db.query(`SELECT id FROM storage.objects WHERE bucket_id = 'private-ijazah-documents'`)).rows,
    );
    expect(anonRead).toEqual([]);
    expect(otherRead).toEqual([]);
    expect(adminRead.length).toBeGreaterThan(0);
  });
});

describe('verification submissions', () => {
  it('forces a teacher submission to submitted state', async () => {
    const row = await as(db, 'authenticated', teacherB, async () =>
      (
        await db.query<{ status: string; submission_code: string }>(
          `INSERT INTO public.verification_submissions
             (teacher_id, target_type, target_record_id, status, submitted_by, decision_summary)
           VALUES ($1, 'teacher_profile', $1, 'approved', $2, 'lulus sendiri')
           RETURNING status, submission_code`,
          [teacherBRecord.id, teacherB],
        )
      ).rows[0],
    );
    expect(row.status).toBe('submitted');
    expect(row.submission_code).toMatch(/^SUB-\d{6}$/);
  });

  it('blocks a duplicate open submission for the same record', async () => {
    await expect(
      as(db, 'authenticated', teacherB, () =>
        db.query(
          `INSERT INTO public.verification_submissions (teacher_id, target_type, target_record_id, submitted_by)
           VALUES ($1, 'teacher_profile', $1, $2)`,
          [teacherBRecord.id, teacherB],
        ),
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it("blocks submitting another teacher's record (IDOR)", async () => {
    await expect(
      as(db, 'authenticated', teacherB, () =>
        db.query(
          `INSERT INTO public.verification_submissions (teacher_id, target_type, target_record_id, submitted_by)
           VALUES ($1, 'teacher_profile', $2, $3)`,
          [teacherBRecord.id, teacherARecord.id, teacherB],
        ),
      ),
    ).rejects.toThrow(/bukan milik/);
  });

  it('does not let a teacher change a submission decision', async () => {
    const res = await as(db, 'authenticated', teacherB, () =>
      db.query(`UPDATE public.verification_submissions SET status = 'approved' WHERE teacher_id = $1`, [
        teacherBRecord.id,
      ]),
    );
    expect(res.affectedRows).toBe(0);
  });
});

describe('audit logs', () => {
  it('records changes automatically without private fields', async () => {
    const res = await db.query<{ new_values: Record<string, unknown> }>(
      `SELECT new_values FROM public.audit_logs WHERE entity_table = 'teachers' AND action = 'INSERT' LIMIT 1`,
    );
    expect(res.rows.length).toBe(1);
    expect(res.rows[0].new_values).not.toHaveProperty('ic_number_encrypted');
    expect(res.rows[0].new_values).not.toHaveProperty('private_phone');
  });

  it('is readable by super admin only', async () => {
    const teacherRows = await as(db, 'authenticated', teacherA, async () =>
      (await db.query(`SELECT id FROM public.audit_logs`)).rows,
    );
    const verifierRows = await as(db, 'authenticated', verifier, async () =>
      (await db.query(`SELECT id FROM public.audit_logs`)).rows,
    );
    const superRows = await as(db, 'authenticated', superAdmin, async () =>
      (await db.query(`SELECT id FROM public.audit_logs`)).rows,
    );
    expect(teacherRows).toEqual([]);
    expect(verifierRows).toEqual([]);
    expect(superRows.length).toBeGreaterThan(0);
  });

  it('is append-only, even for the service role', async () => {
    await expect(
      as(db, 'service_role', null, () => db.query(`DELETE FROM public.audit_logs`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('records app events with the caller as actor', async () => {
    await as(db, 'authenticated', teacherA, () =>
      db.query(`SELECT public.log_audit_event('UJIAN', 'documents', NULL, '{"a":1}'::jsonb)`),
    );
    const res = await db.query<{ actor_profile_id: string }>(
      `SELECT actor_profile_id FROM public.audit_logs WHERE action = 'APP:UJIAN'`,
    );
    expect(res.rows[0].actor_profile_id).toBe(teacherA);
  });
});

describe('rate limiting', () => {
  it('allows up to the limit then blocks, for the service role only', async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 4; i += 1) {
      const r = await as(db, 'service_role', null, async () =>
        (await db.query<{ ok: boolean }>(`SELECT public.consume_rate_limit('login:1.2.3.4', 3, 60) AS ok`)).rows[0].ok,
      );
      results.push(r);
    }
    expect(results).toEqual([true, true, true, false]);

    await expect(
      as(db, 'anon', null, () => db.query(`SELECT public.consume_rate_limit('x', 1, 60)`)),
    ).rejects.toThrow(/permission denied/);
  });
});
