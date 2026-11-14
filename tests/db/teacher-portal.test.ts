/**
 * Phase 3: teacher portal rules (migration 007). Fictional fixtures only.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createTestDatabase, setRoleAsOwner, signUp, stateId } from './harness';

let db: PGlite;
let kelantan: string;
let qiraat: string;
let verifier: string;

async function newTeacher(email: string) {
  const uid = await signUp(db, email);
  const id = await as(db, 'authenticated', uid, async () =>
    (
      await db.query<{ id: string }>(
        `INSERT INTO teachers (profile_id, full_name_rumi, public_display_name, teaching_state_id)
         VALUES ($1, 'Guru Ujian', 'Guru Ujian', $2) RETURNING id`,
        [uid, kelantan],
      )
    ).rows[0].id,
  );
  return { uid, id };
}

async function complete(uid: string, id: string) {
  await as(db, 'authenticated', uid, () =>
    db.query(
      `UPDATE teachers SET primary_qiraat_id = $2, short_bio = 'Guru al-Quran ujian dengan biografi yang cukup panjang.' WHERE id = $1`,
      [id, qiraat],
    ),
  );
}

const statusOf = async (id: string) =>
  (await db.query<{ s: string }>(`SELECT profile_verification_status s FROM teachers WHERE id = $1`, [id])).rows[0].s;

async function adminSet(table: string, id: string, sets: string) {
  await as(db, 'authenticated', verifier, () => db.query(`UPDATE ${table} SET ${sets} WHERE id = $1`, [id]));
}

beforeAll(async () => {
  db = await createTestDatabase();
  kelantan = await stateId(db, 'kelantan');
  qiraat = (await db.query<{ id: string }>(`SELECT id FROM qiraat_types WHERE code = 'Q05-ASIM'`)).rows[0].id;
  verifier = await signUp(db, 'pengesah@ujian.test');
  await setRoleAsOwner(db, verifier, 'verification_admin');
});

describe('updated_at', () => {
  it('is refreshed automatically on update', async () => {
    const { uid, id } = await newTeacher('masa@ujian.test');
    await db.query(`UPDATE teachers SET updated_at = '2000-01-01' WHERE id = $1`, [id]);
    await as(db, 'authenticated', uid, () => db.query(`UPDATE teachers SET short_bio = 'baharu' WHERE id = $1`, [id]));
    const r = await db.query<{ y: number }>(`SELECT extract(year FROM updated_at)::int y FROM teachers WHERE id = $1`, [id]);
    expect(r.rows[0].y).toBeGreaterThan(2000);
  });
});

describe('profile submission', () => {
  it('blocks setting the status directly', async () => {
    const { uid, id } = await newTeacher('terus@ujian.test');
    await expect(
      as(db, 'authenticated', uid, () => db.query(`UPDATE teachers SET profile_verification_status = 'submitted' WHERE id = $1`, [id])),
    ).rejects.toThrow(/penghantaran rasmi/);
  });

  it('rejects an incomplete profile and names what is missing', async () => {
    const uid = await signUp(db, 'tak-lengkap@ujian.test');
    await as(db, 'authenticated', uid, () =>
      db.query(`INSERT INTO teachers (profile_id, full_name_rumi, public_display_name) VALUES ($1, 'Guru', 'Guru')`, [uid]),
    );
    await expect(as(db, 'authenticated', uid, () => db.query(`SELECT submit_my_teacher_profile()`))).rejects.toThrow(
      /negeri mengajar, qiraat utama, biografi ringkas/,
    );
  });

  it('submits atomically: status, draft education, settings and review request', async () => {
    const { uid, id } = await newTeacher('lengkap@ujian.test');
    await complete(uid, id);
    await as(db, 'authenticated', uid, () =>
      db.query(
        `INSERT INTO teacher_education (teacher_id, institution_name, qualification_level, field_of_study) VALUES ($1, 'Universiti Ujian', 'Diploma', 'Tahfiz')`,
        [id],
      ),
    );
    const sub = await as(db, 'authenticated', uid, async () =>
      (await db.query<{ s: string }>(`SELECT submit_my_teacher_profile('Mohon semakan') s`)).rows[0].s,
    );
    expect(await statusOf(id)).toBe('submitted');
    const edu = await db.query<{ s: string }>(`SELECT verification_status s FROM teacher_education WHERE teacher_id = $1`, [id]);
    expect(edu.rows[0].s).toBe('submitted');
    const settings = await db.query(`SELECT 1 FROM teacher_public_settings WHERE teacher_id = $1`, [id]);
    expect(settings.rows).toHaveLength(1);
    const vs = await db.query<{ status: string; target_type: string }>(`SELECT status, target_type FROM verification_submissions WHERE id = $1`, [sub]);
    expect(vs.rows[0]).toEqual({ status: 'submitted', target_type: 'teacher_profile' });

    await expect(as(db, 'authenticated', uid, () => db.query(`SELECT submit_my_teacher_profile()`))).rejects.toThrow(/tidak boleh dihantar/);
  });

  it('lets a teacher withdraw before review, closing the request', async () => {
    const { uid, id } = await newTeacher('tarik@ujian.test');
    await complete(uid, id);
    await as(db, 'authenticated', uid, () => db.query(`SELECT submit_my_teacher_profile()`));
    await as(db, 'authenticated', uid, () => db.query(`SELECT withdraw_my_teacher_submission()`));
    expect(await statusOf(id)).toBe('draft');
    const open = await db.query(`SELECT 1 FROM verification_submissions WHERE teacher_id = $1 AND status = 'submitted'`, [id]);
    expect(open.rows).toHaveLength(0);
    // Can resubmit afterwards.
    await as(db, 'authenticated', uid, () => db.query(`SELECT submit_my_teacher_profile()`));
    expect(await statusOf(id)).toBe('submitted');
  });

  it('allows resubmission after a revision request', async () => {
    const { uid, id } = await newTeacher('pembetulan@ujian.test');
    await complete(uid, id);
    await as(db, 'authenticated', uid, () => db.query(`SELECT submit_my_teacher_profile()`));
    await db.query(`UPDATE verification_submissions SET status = 'revision_required' WHERE teacher_id = $1`, [id]);
    await adminSet('teachers', id, `profile_verification_status = 'revision_required'`);
    await as(db, 'authenticated', uid, () => db.query(`UPDATE teachers SET short_bio = 'Biografi dibetulkan mengikut ulasan pentadbir.' WHERE id = $1`, [id]));
    await as(db, 'authenticated', uid, () => db.query(`SELECT submit_my_teacher_profile()`));
    expect(await statusOf(id)).toBe('submitted');
  });

  it('is not callable by anonymous visitors', async () => {
    await expect(as(db, 'anon', null, () => db.query(`SELECT submit_my_teacher_profile()`))).rejects.toThrow(/permission denied/);
  });
});

describe('content lock on reviewed profiles', () => {
  let t: { uid: string; id: string };

  beforeAll(async () => {
    t = await newTeacher('terbit@ujian.test');
    await complete(t.uid, t.id);
    await as(db, 'authenticated', t.uid, () => db.query(`SELECT submit_my_teacher_profile()`));
  });

  it('allows editing while submitted but not yet under review', async () => {
    await as(db, 'authenticated', t.uid, () => db.query(`UPDATE teachers SET professional_title = 'Al-Muqri' WHERE id = $1`, [t.id]));
  });

  it('locks public fields once under review or published', async () => {
    await adminSet('teachers', t.id, `profile_verification_status = 'published', is_published = TRUE, published_at = NOW()`);
    await expect(
      as(db, 'authenticated', t.uid, () => db.query(`UPDATE teachers SET public_display_name = 'Nama Baharu' WHERE id = $1`, [t.id])),
    ).rejects.toThrow(/permohonan perubahan/);
  });

  it('still allows private contact details to change', async () => {
    await as(db, 'authenticated', t.uid, () =>
      db.query(`UPDATE teachers SET private_phone = '+60123334444', residential_address = 'Alamat baharu' WHERE id = $1`, [t.id]),
    );
  });

  it('accepts one open change request with only whitelisted fields', async () => {
    await as(db, 'authenticated', t.uid, () =>
      db.query(
        `INSERT INTO teacher_change_requests (teacher_id, proposed_changes, submitted_by, status)
         VALUES ($1, '{"public_display_name":"Nama Baharu"}', $2, 'approved')`,
        [t.id, t.uid],
      ),
    );
    const r = await db.query<{ status: string }>(`SELECT status FROM teacher_change_requests WHERE teacher_id = $1`, [t.id]);
    expect(r.rows[0].status).toBe('submitted'); // forced
    await expect(
      as(db, 'authenticated', t.uid, () =>
        db.query(`INSERT INTO teacher_change_requests (teacher_id, proposed_changes, submitted_by) VALUES ($1, '{"short_bio":"x"}', $2)`, [t.id, t.uid]),
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it('rejects change requests that touch protected fields', async () => {
    const other = await newTeacher('lain@ujian.test');
    await complete(other.uid, other.id);
    await as(db, 'authenticated', other.uid, () => db.query(`SELECT submit_my_teacher_profile()`));
    await adminSet('teachers', other.id, `profile_verification_status = 'published', is_published = TRUE`);
    await expect(
      as(db, 'authenticated', other.uid, () =>
        db.query(`INSERT INTO teacher_change_requests (teacher_id, proposed_changes, submitted_by) VALUES ($1, '{"is_published":false}', $2)`, [
          other.id,
          other.uid,
        ]),
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it('does not accept change requests for draft profiles', async () => {
    const d = await newTeacher('draf@ujian.test');
    await expect(
      as(db, 'authenticated', d.uid, () =>
        db.query(`INSERT INTO teacher_change_requests (teacher_id, proposed_changes, submitted_by) VALUES ($1, '{"short_bio":"x"}', $2)`, [d.id, d.uid]),
      ),
    ).rejects.toThrow(/diluluskan atau diterbitkan/);
  });

  it("cannot create a change request for another teacher", async () => {
    const intruder = await newTeacher('penceroboh@ujian.test');
    await expect(
      as(db, 'authenticated', intruder.uid, () =>
        db.query(`INSERT INTO teacher_change_requests (teacher_id, proposed_changes, submitted_by) VALUES ($1, '{"short_bio":"x"}', $2)`, [
          t.id,
          intruder.uid,
        ]),
      ),
      // The guard trigger runs before RLS WITH CHECK; the intruder cannot even see the target.
    ).rejects.toThrow(/row-level security|diluluskan atau diterbitkan/);
  });
});

describe('education re-review', () => {
  it('sends an edited approved entry back for review', async () => {
    const { uid, id } = await newTeacher('edu@ujian.test');
    const eduId = await as(db, 'authenticated', uid, async () =>
      (
        await db.query<{ id: string }>(
          `INSERT INTO teacher_education (teacher_id, institution_name, qualification_level, field_of_study) VALUES ($1, 'Uni A', 'Diploma', 'Qiraat') RETURNING id`,
          [id],
        )
      ).rows[0].id,
    );
    await adminSet('teacher_education', eduId, `verification_status = 'approved'`);

    // Toggling public visibility does not trigger re-review.
    await as(db, 'authenticated', uid, () => db.query(`UPDATE teacher_education SET is_public = FALSE WHERE id = $1`, [eduId]));
    let s = await db.query<{ s: string }>(`SELECT verification_status s FROM teacher_education WHERE id = $1`, [eduId]);
    expect(s.rows[0].s).toBe('approved');

    await as(db, 'authenticated', uid, () => db.query(`UPDATE teacher_education SET field_of_study = 'Tahfiz' WHERE id = $1`, [eduId]));
    s = await db.query<{ s: string }>(`SELECT verification_status s FROM teacher_education WHERE id = $1`, [eduId]);
    expect(s.rows[0].s).toBe('submitted');
  });

  it('locks entries that are under review', async () => {
    const { uid, id } = await newTeacher('edu2@ujian.test');
    const eduId = await as(db, 'authenticated', uid, async () =>
      (
        await db.query<{ id: string }>(
          `INSERT INTO teacher_education (teacher_id, institution_name, qualification_level, field_of_study) VALUES ($1, 'Uni B', 'Diploma', 'Qiraat') RETURNING id`,
          [id],
        )
      ).rows[0].id,
    );
    await adminSet('teacher_education', eduId, `verification_status = 'under_review'`);
    await expect(
      as(db, 'authenticated', uid, () => db.query(`UPDATE teacher_education SET field_of_study = 'X' WHERE id = $1`, [eduId])),
    ).rejects.toThrow(/sedang disemak/);
  });
});

describe('teacher-proposed institutions', () => {
  it('are always created unverified and deduplicated by name and state', async () => {
    const { uid } = await newTeacher('inst@ujian.test');
    const row = await as(db, 'authenticated', uid, async () =>
      (
        await db.query<{ is_verified: boolean; name: string }>(
          `INSERT INTO institutions (name, category, state_id, is_verified) VALUES ('  Maahad   Cadangan Ujian ', 'Maahad Tahfiz', $1, TRUE) RETURNING is_verified, name`,
          [kelantan],
        )
      ).rows[0],
    );
    expect(row).toEqual({ is_verified: false, name: 'Maahad Cadangan Ujian' });
    await expect(
      as(db, 'authenticated', uid, () =>
        db.query(`INSERT INTO institutions (name, category, state_id) VALUES ('maahad cadangan ujian', 'Maahad Tahfiz', $1)`, [kelantan]),
      ),
    ).rejects.toThrow(/duplicate key/);
  });

  it('cannot be edited by teachers', async () => {
    const { uid } = await newTeacher('inst2@ujian.test');
    const res = await as(db, 'authenticated', uid, () => db.query(`UPDATE institutions SET is_verified = TRUE`));
    expect(res.affectedRows).toBe(0);
  });
});

describe('teacher photo storage', () => {
  it('owners can read and remove only their own photo objects', async () => {
    const a = await newTeacher('foto-a@ujian.test');
    const b = await newTeacher('foto-b@ujian.test');
    await as(db, 'authenticated', a.uid, () =>
      db.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('teacher-photos', $1)`, [`${a.uid}/avatar-abcdefgh.jpg`]),
    );
    await expect(
      as(db, 'authenticated', b.uid, () =>
        db.query(`INSERT INTO storage.objects (bucket_id, name) VALUES ('teacher-photos', $1)`, [`${a.uid}/avatar-zzzzzzzz.jpg`]),
      ),
    ).rejects.toThrow(/row-level security/);
    const own = await as(db, 'authenticated', a.uid, async () => (await db.query(`SELECT name FROM storage.objects WHERE bucket_id = 'teacher-photos'`)).rows);
    const other = await as(db, 'authenticated', b.uid, async () => (await db.query(`SELECT name FROM storage.objects WHERE bucket_id = 'teacher-photos'`)).rows);
    expect(own).toHaveLength(1);
    expect(other).toHaveLength(0);
    const del = await as(db, 'authenticated', b.uid, () => db.query(`DELETE FROM storage.objects WHERE bucket_id = 'teacher-photos'`));
    expect(del.affectedRows).toBe(0);
  });
});
