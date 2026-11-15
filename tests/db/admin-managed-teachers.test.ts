/**
 * Migration 013: administrators create and edit teacher data (teachers without an account). Fictional fixtures.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createTestDatabase, setRoleAsOwner, signUp, stateId } from './harness';

let db: PGlite;
let admin: string;
let qiraat: string;
let riwayat: string;
let kel: string;
let n = 0;

const asAdmin = <R,>(sql: string, params: unknown[] = []) => as(db, 'authenticated', admin, async () => (await db.query<R>(sql, params)).rows);

async function managedTeacher(name = 'Guru Warga Emas') {
  n += 1;
  const [row] = await asAdmin<{ id: string }>(
    `INSERT INTO teachers (profile_id, managed_by_admin, full_name_rumi, public_display_name, teaching_state_id, primary_qiraat_id, primary_riwayat_id, short_bio)
     VALUES (NULL, TRUE, $1, $1, $2, $3, $4, 'Guru al-Quran warga emas yang mengajar di kampung sejak sekian lama.') RETURNING id`,
    [`${name} ${n}`, kel, qiraat, riwayat],
  );
  return row.id;
}

beforeAll(async () => {
  db = await createTestDatabase();
  admin = await signUp(db, 'pentadbir-urus@ujian.test');
  await setRoleAsOwner(db, admin, 'verification_admin');
  kel = await stateId(db, 'kelantan');
  qiraat = (await db.query<{ id: string }>(`SELECT id FROM qiraat_types WHERE code = 'Q05-ASIM'`)).rows[0].id;
  riwayat = (await db.query<{ id: string }>(`SELECT id FROM riwayat_types WHERE code = 'R-HAFS'`)).rows[0].id;
});

describe('profiles without an account', () => {
  it('administrators can create one; it must be marked as managed', async () => {
    const id = await managedTeacher();
    const row = (await db.query<{ profile_id: string | null; managed_by_admin: boolean }>(`SELECT profile_id, managed_by_admin FROM teachers WHERE id = $1`, [id])).rows[0];
    expect(row).toEqual({ profile_id: null, managed_by_admin: true });
    await expect(
      asAdmin(`INSERT INTO teachers (profile_id, full_name_rumi, public_display_name) VALUES (NULL, 'X', 'X')`),
    ).rejects.toThrow(/chk_teachers_owner_or_managed/);
  });

  it('teachers cannot create or claim one', async () => {
    const uid = await signUp(db, 'bukan-pentadbir@ujian.test');
    await expect(
      as(db, 'authenticated', uid, () =>
        db.query(`INSERT INTO teachers (profile_id, managed_by_admin, full_name_rumi, public_display_name) VALUES (NULL, TRUE, 'X', 'X')`),
      ),
    ).rejects.toThrow(/row-level security/);
    const id = await managedTeacher();
    await as(db, 'authenticated', uid, () => db.query(`UPDATE teachers SET profile_id = $1 WHERE id = $2`, [uid, id]));
    expect((await db.query<{ p: string | null }>(`SELECT profile_id p FROM teachers WHERE id = $1`, [id])).rows[0].p).toBeNull();
    await expect(as(db, 'authenticated', uid, () => db.query(`SELECT submit_my_teacher_profile(NULL, $1)`, [id]))).rejects.toThrow(/Hanya pentadbir/);
    await expect(as(db, 'authenticated', uid, () => db.query(`SELECT ensure_my_sanad_node($1)`, [id]))).rejects.toThrow(/Hanya pentadbir/);
  });

  it('full flow: education, sanad, document, submit, publish, public search', async () => {
    const id = await managedTeacher('Guru Aliran Pentadbir');
    await asAdmin(`INSERT INTO teacher_education (teacher_id, institution_name, qualification_level, field_of_study) VALUES ($1, 'Pondok', 'Sijil', 'Qiraat')`, [id]);

    const [{ node }] = await asAdmin<{ node: string }>(`SELECT ensure_my_sanad_node($1) node`, [id]);
    const [{ again }] = await asAdmin<{ again: string }>(`SELECT ensure_my_sanad_node($1) again`, [id]);
    expect(again).toBe(node);
    const [{ id: shaykh }] = await asAdmin<{ id: string }>(
      `INSERT INTO sanad_nodes (full_name_rumi, full_name_arabic, alternative_spellings, generation_category) VALUES ('Syeikh Rekaan', 'شيخ', '{}', 'Masyaikh Mutaakhirin') RETURNING id`,
    );
    const [{ id: chain }] = await asAdmin<{ id: string }>(
      `INSERT INTO sanad_chains (teacher_id, title, qiraat_id, riwayat_id) VALUES ($1, 'Sanad Hafs', $2, $3) RETURNING id`,
      [id, qiraat, riwayat],
    );
    await asAdmin(`INSERT INTO sanad_edges (sanad_chain_id, source_node_id, target_node_id) VALUES ($1, $2, $3)`, [chain, shaykh, node]);
    const [{ s: chainSub }] = await asAdmin<{ s: string }>(`SELECT submit_my_sanad_chain($1) s`, [chain]);

    const path = `${admin}/${String(n).padStart(20, '0')}.pdf`;
    await as(db, 'authenticated', admin, () =>
      db.query(`INSERT INTO storage.objects (bucket_id, name, metadata) VALUES ('private-ijazah-documents', $1, $2)`, [path, JSON.stringify({ size: 100 })]),
    );
    const [{ doc }] = await asAdmin<{ doc: string }>(
      `SELECT register_my_document($1, 'Sijil Ijazah Sanad', 'sijil.pdf', 'application/pdf', 100, $2, NULL, NULL, TRUE, $3) doc`,
      [path, chain, id],
    );
    expect((await db.query<{ t: string }>(`SELECT teacher_id t FROM documents WHERE id = $1`, [doc])).rows[0].t).toBe(id);

    const [{ s: profileSub }] = await asAdmin<{ s: string }>(`SELECT submit_my_teacher_profile('Dimasukkan oleh pentadbir', $1) s`, [id]);
    await asAdmin(`SELECT admin_decide_submission($1, 'publish')`, [profileSub]);
    await asAdmin(`SELECT admin_decide_submission($1, 'approve')`, [chainSub]);
    const docSub = (await db.query<{ id: string }>(`SELECT id FROM verification_submissions WHERE target_record_id = $1 AND status = 'submitted'`, [doc])).rows[0].id;
    await asAdmin(`SELECT admin_decide_submission($1, 'approve')`, [docSub]);

    const found = await as(db, 'anon', null, async () => (await db.query<{ total: number }>(`SELECT search_public_teachers('Aliran Pentadbir') r`)).rows);
    expect(JSON.stringify(found)).toContain(id);
    const docs = await as(db, 'anon', null, async () => (await db.query(`SELECT * FROM get_public_sanad_documents($1)`, [id])).rows);
    expect(docs).toHaveLength(1);
    const graph = await as(db, 'anon', null, async () => (await db.query<{ g: { edges: unknown[] } }>(`SELECT get_public_sanad_graph(NULL, $1) g`, [id])).rows[0].g);
    expect(graph.edges).toHaveLength(1);
    const notes = await db.query(`SELECT 1 FROM notifications WHERE related_entity_id = $1`, [id]);
    expect(notes.rows).toEqual([]);
  });
});

describe('editing teachers who have an account', () => {
  it('notifies the teacher once per 30 minutes; own edits do not notify', async () => {
    const uid = await signUp(db, 'guru-akaun@ujian.test');
    const id = await as(db, 'authenticated', uid, async () =>
      (
        await db.query<{ id: string }>(
          `INSERT INTO teachers (profile_id, full_name_rumi, public_display_name, teaching_state_id) VALUES ($1, 'Guru Akaun', 'Guru Akaun', $2) RETURNING id`,
          [uid, kel],
        )
      ).rows[0].id,
    );
    await as(db, 'authenticated', uid, () => db.query(`UPDATE teachers SET short_bio = 'diubah sendiri' WHERE id = $1`, [id]));
    const count = async () =>
      Number((await db.query<{ c: string }>(`SELECT COUNT(*) c FROM notifications WHERE recipient_profile_id = $1 AND notification_type = 'profile_updated_by_admin'`, [uid])).rows[0].c);
    expect(await count()).toBe(0);

    await asAdmin(`UPDATE teachers SET short_bio = 'dibetulkan oleh pentadbir' WHERE id = $1`, [id]);
    await asAdmin(`INSERT INTO teacher_education (teacher_id, institution_name, qualification_level, field_of_study) VALUES ($1, 'Maahad', 'Diploma', 'Tahfiz')`, [id]);
    expect(await count()).toBe(1);
  });

  it('decision functions still work and do not add edit notifications', async () => {
    const uid = await signUp(db, 'guru-akaun2@ujian.test');
    const id = await as(db, 'authenticated', uid, async () =>
      (
        await db.query<{ id: string }>(
          `INSERT INTO teachers (profile_id, full_name_rumi, public_display_name, teaching_state_id, primary_qiraat_id, short_bio)
           VALUES ($1, 'Guru Dua', 'Guru Dua', $2, $3, 'Biografi ringkas yang cukup panjang untuk dihantar.') RETURNING id`,
          [uid, kel, qiraat],
        )
      ).rows[0].id,
    );
    const sub = await as(db, 'authenticated', uid, async () => (await db.query<{ s: string }>(`SELECT submit_my_teacher_profile() s`)).rows[0].s);
    await asAdmin(`SELECT admin_decide_submission($1, 'publish')`, [sub]);
    const types = (await db.query<{ t: string }>(`SELECT notification_type t FROM notifications WHERE recipient_profile_id = $1`, [uid])).rows.map((r) => r.t);
    expect(types).toContain('profile_published');
    expect(types).not.toContain('profile_updated_by_admin');
  });
});

describe('admin_link_teacher_account', () => {
  it('attaches a managed profile to a registered account', async () => {
    const id = await managedTeacher('Guru Dipautkan');
    const uid = await signUp(db, 'anak-guru@ujian.test');
    await asAdmin(`SELECT admin_link_teacher_account($1, 'ANAK-GURU@ujian.test')`, [id]);
    const row = (await db.query<{ profile_id: string; managed_by_admin: boolean }>(`SELECT profile_id, managed_by_admin FROM teachers WHERE id = $1`, [id])).rows[0];
    expect(row).toEqual({ profile_id: uid, managed_by_admin: false });
    expect(await as(db, 'authenticated', uid, async () => (await db.query<{ o: boolean }>(`SELECT owns_teacher($1) o`, [id])).rows[0].o)).toBe(true);
    await expect(asAdmin(`SELECT admin_link_teacher_account($1, 'anak-guru@ujian.test')`, [id])).rejects.toThrow(/sudah/);
    await expect(asAdmin(`SELECT admin_link_teacher_account($1, 'tiada@ujian.test')`, [await managedTeacher()])).rejects.toThrow(/Tiada akaun/);
    await expect(as(db, 'authenticated', uid, () => db.query(`SELECT admin_link_teacher_account($1, 'x@ujian.test')`, [id]))).rejects.toThrow(/Hanya pentadbir/);
  });
});
