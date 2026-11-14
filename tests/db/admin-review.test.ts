/**
 * Phase 6: administrator review workflow (migration 010). Fictional fixtures only.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createTestDatabase, setRoleAsOwner, signUp, stateId } from './harness';

let db: PGlite;
let admin: string;
let superAdmin: string;
let qiraat: string;
let riwayat: string;
let n = 0;

const one = async <R,>(sql: string, params: unknown[] = []) => (await db.query<R>(sql, params)).rows[0];
const asAdmin = <R,>(sql: string, params: unknown[] = []) => as(db, 'authenticated', admin, async () => (await db.query<R>(sql, params)).rows);

interface T {
  uid: string;
  id: string;
}

async function submittedTeacher(): Promise<T & { submission: string }> {
  n += 1;
  const uid = await signUp(db, `semak${n}@ujian.test`);
  const kel = await stateId(db, 'kelantan');
  const id = await as(db, 'authenticated', uid, async () => {
    const t = (
      await db.query<{ id: string }>(
        `INSERT INTO teachers (profile_id, full_name_rumi, public_display_name, teaching_state_id, primary_qiraat_id, short_bio)
         VALUES ($1, 'Guru Semakan', 'Guru Semakan', $2, $3, 'Biografi ringkas guru ujian untuk semakan pentadbir.') RETURNING id`,
        [uid, kel, qiraat],
      )
    ).rows[0].id;
    await db.query(`INSERT INTO teacher_education (teacher_id, institution_name, qualification_level, field_of_study) VALUES ($1, 'Uni', 'Diploma', 'Qiraat')`, [t]);
    return t;
  });
  const submission = await as(db, 'authenticated', uid, async () => (await one<{ s: string }>(`SELECT submit_my_teacher_profile() s`)).s);
  return { uid, id, submission };
}

const status = async (id: string) => (await one<{ s: string }>(`SELECT profile_verification_status s FROM teachers WHERE id = $1`, [id])).s;
const notifications = async (uid: string) =>
  as(db, 'authenticated', uid, async () => (await db.query<{ notification_type: string; message: string }>(`SELECT notification_type, message FROM notifications ORDER BY created_at`)).rows);

beforeAll(async () => {
  db = await createTestDatabase();
  admin = await signUp(db, 'pentadbir@ujian.test');
  superAdmin = await signUp(db, 'super@ujian.test');
  await setRoleAsOwner(db, admin, 'verification_admin');
  await setRoleAsOwner(db, superAdmin, 'super_admin');
  qiraat = (await one<{ id: string }>(`SELECT id FROM qiraat_types WHERE code = 'Q05-ASIM'`)).id;
  riwayat = (await one<{ id: string }>(`SELECT id FROM riwayat_types WHERE code = 'R-HAFS'`)).id;
});

describe('access', () => {
  it('only administrators can call the review functions', async () => {
    const t = await submittedTeacher();
    await expect(as(db, 'authenticated', t.uid, () => db.query(`SELECT admin_start_review($1)`, [t.submission]))).rejects.toThrow(/Hanya pentadbir/);
    await expect(
      as(db, 'authenticated', t.uid, () => db.query(`SELECT admin_decide_submission($1, 'publish')`, [t.submission])),
    ).rejects.toThrow(/Hanya pentadbir/);
    await expect(as(db, 'anon', null, () => db.query(`SELECT admin_dashboard_counts()`))).rejects.toThrow(/permission denied/);
  });
});

describe('profile review', () => {
  it('start review locks the profile and notifies the teacher', async () => {
    const t = await submittedTeacher();
    await asAdmin(`SELECT admin_start_review($1)`, [t.submission]);
    expect(await status(t.id)).toBe('under_review');
    await expect(
      as(db, 'authenticated', t.uid, () => db.query(`UPDATE teachers SET short_bio = 'ubah semasa semakan' WHERE id = $1`, [t.id])),
    ).rejects.toThrow(/permohonan perubahan/);
    expect((await notifications(t.uid)).map((x) => x.notification_type)).toContain('verification_started');
  });

  it('publish makes the profile public, approves submitted entries and records the review', async () => {
    const t = await submittedTeacher();
    await asAdmin(`SELECT admin_decide_submission($1, 'publish', NULL, 'Disemak dengan dokumen asal', '{"identiti": true}')`, [t.submission]);
    expect(await status(t.id)).toBe('published');
    const pub = await as(db, 'anon', null, async () => (await db.query(`SELECT id FROM v_public_teachers WHERE id = $1`, [t.id])).rows);
    expect(pub).toHaveLength(1);
    const edu = await one<{ s: string }>(`SELECT verification_status s FROM teacher_education WHERE teacher_id = $1`, [t.id]);
    expect(edu.s).toBe('published');
    const sub = await one<{ status: string; decided_at: string }>(`SELECT status, decided_at FROM verification_submissions WHERE id = $1`, [t.submission]);
    expect(sub.status).toBe('published');
    expect(sub.decided_at).not.toBeNull();
    const review = await one<{ internal_admin_comment: string; checklist_verified: Record<string, boolean> }>(
      `SELECT internal_admin_comment, checklist_verified FROM verification_reviews WHERE submission_id = $1`,
      [t.submission],
    );
    expect(review).toEqual({ internal_admin_comment: 'Disemak dengan dokumen asal', checklist_verified: { identiti: true } });
    expect((await notifications(t.uid)).map((x) => x.notification_type)).toContain('profile_published');
  });

  it('keeps internal comments away from the teacher', async () => {
    const t = await submittedTeacher();
    await asAdmin(`SELECT admin_decide_submission($1, 'publish', 'Tahniah', 'NOTA-DALAMAN-RAHSIA')`, [t.submission]);
    const reviews = await as(db, 'authenticated', t.uid, async () => (await db.query(`SELECT * FROM verification_reviews`)).rows);
    expect(reviews).toEqual([]);
    const subs = await as(db, 'authenticated', t.uid, async () => (await db.query(`SELECT * FROM verification_submissions`)).rows);
    expect(JSON.stringify(subs)).not.toContain('NOTA-DALAMAN-RAHSIA');
    expect(JSON.stringify(await notifications(t.uid))).not.toContain('NOTA-DALAMAN-RAHSIA');
  });

  it('requires feedback to reject or request revision', async () => {
    const t = await submittedTeacher();
    await expect(asAdmin(`SELECT admin_decide_submission($1, 'reject', '  ')`, [t.submission])).rejects.toThrow(/Ulasan kepada guru diperlukan/);
    await expect(asAdmin(`SELECT admin_decide_submission($1, 'merge')`, [t.submission])).rejects.toThrow(/Keputusan tidak sah/);
  });

  it('revision request lets the teacher fix and resubmit; decisions cannot be repeated', async () => {
    const t = await submittedTeacher();
    await asAdmin(`SELECT admin_decide_submission($1, 'revision_required', 'Sila lengkapkan gelaran.')`, [t.submission]);
    expect(await status(t.id)).toBe('revision_required');
    await expect(asAdmin(`SELECT admin_decide_submission($1, 'publish')`, [t.submission])).rejects.toThrow(/telah diputuskan/);
    const msgs = await notifications(t.uid);
    expect(msgs.at(-1)).toEqual({ notification_type: 'correction_requested', message: 'Sila lengkapkan gelaran.' });
    await as(db, 'authenticated', t.uid, async () => {
      await db.query(`UPDATE teachers SET professional_title = 'Al-Muqri' WHERE id = $1`, [t.id]);
      await db.query(`SELECT submit_my_teacher_profile()`);
    });
    expect(await status(t.id)).toBe('submitted');
  });

  it('reject is final for the teacher', async () => {
    const t = await submittedTeacher();
    await asAdmin(`SELECT admin_decide_submission($1, 'reject', 'Maklumat tidak dapat disahkan.')`, [t.submission]);
    expect(await status(t.id)).toBe('rejected');
    await expect(as(db, 'authenticated', t.uid, () => db.query(`SELECT submit_my_teacher_profile()`))).rejects.toThrow(/tidak boleh dihantar/);
  });
});

describe('publication controls', () => {
  it('suspend hides the profile, reinstate returns it to approved, publish shows it again', async () => {
    const t = await submittedTeacher();
    await asAdmin(`SELECT admin_decide_submission($1, 'publish')`, [t.submission]);
    await expect(asAdmin(`SELECT admin_set_publication($1, 'suspend', '')`, [t.id])).rejects.toThrow(/sebab/);
    await asAdmin(`SELECT admin_set_publication($1, 'suspend', 'Aduan sedang disiasat.')`, [t.id]);
    const hidden = await as(db, 'anon', null, async () => (await db.query(`SELECT id FROM v_public_teachers WHERE id = $1`, [t.id])).rows);
    expect(hidden).toEqual([]);
    await asAdmin(`SELECT admin_set_publication($1, 'reinstate')`, [t.id]);
    expect(await status(t.id)).toBe('approved');
    await asAdmin(`SELECT admin_set_publication($1, 'publish')`, [t.id]);
    expect(await status(t.id)).toBe('published');
    expect((await notifications(t.uid)).map((x) => x.notification_type)).toEqual(
      expect.arrayContaining(['account_suspended', 'account_reinstated', 'profile_published']),
    );
  });

  it('features only published teachers', async () => {
    const t = await submittedTeacher();
    await asAdmin(`SELECT admin_set_featured($1, TRUE)`, [t.id]);
    expect((await one<{ f: boolean }>(`SELECT is_featured f FROM teachers WHERE id = $1`, [t.id])).f).toBe(false);
    await asAdmin(`SELECT admin_decide_submission($1, 'publish')`, [t.submission]);
    await asAdmin(`SELECT admin_set_featured($1, TRUE)`, [t.id]);
    expect((await one<{ f: boolean }>(`SELECT is_featured f FROM teachers WHERE id = $1`, [t.id])).f).toBe(true);
  });
});

describe('change requests', () => {
  it('approval applies only the proposed whitelisted fields', async () => {
    const t = await submittedTeacher();
    await asAdmin(`SELECT admin_decide_submission($1, 'publish')`, [t.submission]);
    const req = await as(db, 'authenticated', t.uid, async () =>
      (
        await db.query<{ id: string }>(
          `INSERT INTO teacher_change_requests (teacher_id, proposed_changes, submitted_by)
           VALUES ($1, '{"public_display_name": "Nama Baharu Diluluskan", "specializations": ["Tahsin", "Tahfiz"]}', $2) RETURNING id`,
          [t.id, t.uid],
        )
      ).rows[0].id,
    );
    await asAdmin(`SELECT admin_decide_change_request($1, TRUE)`, [req]);
    const row = await one<{ public_display_name: string; specializations: string[]; short_bio: string; profile_verification_status: string }>(
      `SELECT public_display_name, specializations, short_bio, profile_verification_status FROM teachers WHERE id = $1`,
      [t.id],
    );
    expect(row).toEqual({
      public_display_name: 'Nama Baharu Diluluskan',
      specializations: ['Tahsin', 'Tahfiz'],
      short_bio: 'Biografi ringkas guru ujian untuk semakan pentadbir.',
      profile_verification_status: 'published',
    });
    const pub = await as(db, 'anon', null, async () =>
      (await db.query<{ n: string }>(`SELECT public_display_name n FROM v_public_teachers WHERE id = $1`, [t.id])).rows[0],
    );
    expect(pub.n).toBe('Nama Baharu Diluluskan');
    await expect(asAdmin(`SELECT admin_decide_change_request($1, FALSE, 'x')`, [req])).rejects.toThrow(/telah diputuskan/);
  });

  it('rejection leaves the profile unchanged and needs feedback', async () => {
    const t = await submittedTeacher();
    await asAdmin(`SELECT admin_decide_submission($1, 'publish')`, [t.submission]);
    const req = await as(db, 'authenticated', t.uid, async () =>
      (await db.query<{ id: string }>(`INSERT INTO teacher_change_requests (teacher_id, proposed_changes, submitted_by) VALUES ($1, '{"short_bio": "Tidak sesuai"}', $2) RETURNING id`, [t.id, t.uid]))
        .rows[0].id,
    );
    await expect(asAdmin(`SELECT admin_decide_change_request($1, FALSE)`, [req])).rejects.toThrow(/Ulasan/);
    await asAdmin(`SELECT admin_decide_change_request($1, FALSE, 'Biografi perlu lebih lengkap.')`, [req]);
    expect((await one<{ b: string }>(`SELECT short_bio b FROM teachers WHERE id = $1`, [t.id])).b).toMatch(/^Biografi ringkas/);
  });
});

describe('documents and badges', () => {
  it('approving a document sets the derived badge; rejecting does not', async () => {
    const t = await submittedTeacher();
    const upload = async (name: string) => {
      await as(db, 'authenticated', t.uid, () =>
        db.query(`INSERT INTO storage.objects (bucket_id, name, metadata) VALUES ('private-ijazah-documents', $1, '{"size": 100}')`, [name]),
      );
      const doc = await as(db, 'authenticated', t.uid, async () =>
        (await one<{ id: string }>(`SELECT register_my_document($1, 'Sijil Ijazah Sanad', 'a.pdf', 'application/pdf', 100) id`, [name])).id,
      );
      return (await one<{ id: string }>(`SELECT id FROM verification_submissions WHERE target_record_id = $1`, [doc])).id;
    };
    const s1 = await upload(`${t.uid}/aaaaaaaaaaaaaaaaaaa1.pdf`);
    await asAdmin(`SELECT admin_decide_submission($1, 'reject', 'Imbasan kabur.')`, [s1]);
    expect((await one<{ b: boolean }>(`SELECT documents_reviewed_badge b FROM teachers WHERE id = $1`, [t.id])).b).toBe(false);
    const s2 = await upload(`${t.uid}/aaaaaaaaaaaaaaaaaaa2.pdf`);
    await asAdmin(`SELECT admin_decide_submission($1, 'approve')`, [s2]);
    expect((await one<{ b: boolean }>(`SELECT documents_reviewed_badge b FROM teachers WHERE id = $1`, [t.id])).b).toBe(true);
    const types = (await notifications(t.uid)).map((x) => x.notification_type);
    expect(types).toEqual(expect.arrayContaining(['document_rejected', 'document_approved']));
  });
});

describe('sanad review', () => {
  async function chainWithEdges(t: T) {
    return as(db, 'authenticated', t.uid, async () => {
      const self = (await one<{ n: string }>(`SELECT ensure_my_sanad_node() n`)).n;
      const chain = (await one<{ id: string }>(`INSERT INTO sanad_chains (teacher_id, title, qiraat_id, riwayat_id) VALUES ($1, 'Sanad Semakan', $2, $3) RETURNING id`, [t.id, qiraat, riwayat])).id;
      const shaykh = (await one<{ id: string }>(`INSERT INTO sanad_nodes (full_name_rumi, full_name_arabic, generation_category) VALUES ('Syeikh Semakan', 'شيخ', 'Masyaikh Mutaakhirin') RETURNING id`)).id;
      await db.query(`INSERT INTO sanad_edges (sanad_chain_id, source_node_id, target_node_id) VALUES ($1, $2, $3)`, [chain, shaykh, self]);
      const sub = (await one<{ s: string }>(`SELECT submit_my_sanad_chain($1) s`, [chain])).s;
      return { chain, shaykh, self, sub };
    });
  }

  it('approval publishes the chain, its edges and nodes, and sets the sanad badge', async () => {
    const t = await submittedTeacher();
    await asAdmin(`SELECT admin_decide_submission($1, 'publish')`, [t.submission]);
    const c = await chainWithEdges(t);
    await asAdmin(`SELECT admin_start_review($1)`, [c.sub]);
    await asAdmin(`SELECT admin_decide_submission($1, 'approve')`, [c.sub]);
    const graph = await as(db, 'anon', null, async () =>
      (await one<{ g: { edges: unknown[]; nodes: unknown[] } }>(`SELECT get_public_sanad_graph(p_chain_id => $1) g`, [c.chain])).g,
    );
    expect(graph.edges).toHaveLength(1);
    expect(graph.nodes).toHaveLength(2);
    expect((await one<{ b: boolean }>(`SELECT sanad_reviewed_badge b FROM teachers WHERE id = $1`, [t.id])).b).toBe(true);
    const revs = await db.query<{ reason: string }>(`SELECT reason FROM sanad_chain_revisions WHERE sanad_chain_id = $1 ORDER BY revision_no`, [c.chain]);
    expect(revs.rows.map((r) => r.reason)).toEqual(['submitted', 'decision_approved']);
  });

  it('refuses approval while an item is marked for correction', async () => {
    const t = await submittedTeacher();
    const c = await chainWithEdges(t);
    await asAdmin(`SELECT admin_set_item_status('sanad_nodes', $1, 'revision_required')`, [c.shaykh]);
    await expect(asAdmin(`SELECT admin_decide_submission($1, 'approve')`, [c.sub])).rejects.toThrow(/perlu pembetulan atau ditolak/);
    await asAdmin(`SELECT admin_decide_submission($1, 'revision_required', 'Tahun wafat syeikh perlu dibetulkan.')`, [c.sub]);
    // The teacher can now fix the node and the chain.
    await as(db, 'authenticated', t.uid, () => db.query(`UPDATE sanad_nodes SET death_year_hijri = '1420H' WHERE id = $1`, [c.shaykh]));
    await as(db, 'authenticated', t.uid, () => db.query(`UPDATE sanad_chains SET title = 'Sanad Semakan (dibetulkan)' WHERE id = $1`, [c.chain]));
  });

  it('an approved revision replaces the chain it supersedes', async () => {
    const t = await submittedTeacher();
    await asAdmin(`SELECT admin_decide_submission($1, 'publish')`, [t.submission]);
    const c = await chainWithEdges(t);
    await asAdmin(`SELECT admin_decide_submission($1, 'approve')`, [c.sub]);
    const rev = await as(db, 'authenticated', t.uid, async () => (await one<{ r: string }>(`SELECT revise_my_sanad_chain($1) r`, [c.chain])).r);
    const revSub = await as(db, 'authenticated', t.uid, async () => (await one<{ s: string }>(`SELECT submit_my_sanad_chain($1) s`, [rev])).s);
    await asAdmin(`SELECT admin_decide_submission($1, 'approve')`, [revSub]);
    const old = await one<{ verification_status: string; is_public: boolean }>(`SELECT verification_status, is_public FROM sanad_chains WHERE id = $1`, [c.chain]);
    expect(old).toEqual({ verification_status: 'suspended', is_public: false });
    const visible = await as(db, 'anon', null, async () => (await db.query<{ id: string }>(`SELECT id FROM v_public_sanad_chains WHERE teacher_id = $1`, [t.id])).rows);
    expect(visible.map((r) => r.id)).toEqual([rev]);
  });
});

describe('individual items', () => {
  it('only allows the whitelisted tables', async () => {
    await expect(asAdmin(`SELECT admin_set_item_status('profiles', gen_random_uuid(), 'approved')`)).rejects.toThrow(/tidak dibenarkan/);
    await expect(asAdmin(`SELECT admin_set_item_status('teacher_education', gen_random_uuid(), 'published')`)).rejects.toThrow(/Status tidak sah/);
  });
});

describe('notifications', () => {
  it('teachers can mark their own as read but not edit or see others', async () => {
    const t = await submittedTeacher();
    const other = await submittedTeacher();
    await asAdmin(`SELECT admin_start_review($1)`, [t.submission]);
    const id = await as(db, 'authenticated', t.uid, async () => (await one<{ id: string }>(`SELECT id FROM notifications LIMIT 1`)).id);
    await as(db, 'authenticated', t.uid, () => db.query(`UPDATE notifications SET is_read = TRUE WHERE id = $1`, [id]));
    expect((await one<{ read_at: string | null }>(`SELECT read_at FROM notifications WHERE id = $1`, [id])).read_at).not.toBeNull();
    await expect(
      as(db, 'authenticated', t.uid, () => db.query(`UPDATE notifications SET message = 'diubah' WHERE id = $1`, [id])),
    ).rejects.toThrow(/status dibaca/);
    const seen = await as(db, 'authenticated', other.uid, async () => (await db.query(`SELECT id FROM notifications WHERE id = $1`, [id])).rows);
    expect(seen).toEqual([]);
    await expect(
      as(db, 'authenticated', t.uid, () =>
        db.query(`INSERT INTO notifications (recipient_profile_id, notification_type, title, message) VALUES ($1, 'profile_published', 'x', 'x')`, [other.uid]),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe('identity check', () => {
  it('requires a reason and writes an audit entry before returning the ciphertext', async () => {
    const t = await submittedTeacher();
    await db.query(`UPDATE teachers SET ic_number_encrypted = 'v1:iv:tag:ct' WHERE id = $1`, [t.id]);
    await expect(asAdmin(`SELECT admin_get_teacher_ic_ciphertext($1, 'x')`, [t.id])).rejects.toThrow(/sebab/);
    const rows = await asAdmin<{ c: string }>(`SELECT admin_get_teacher_ic_ciphertext($1, 'Pengesahan identiti permohonan') c`, [t.id]);
    expect(rows[0].c).toBe('v1:iv:tag:ct');
    const audit = await one<{ new_values: { reason: string } }>(`SELECT new_values FROM audit_logs WHERE action = 'APP:REVEAL_IC' AND entity_id = $1`, [t.id]);
    expect(audit.new_values.reason).toBe('Pengesahan identiti permohonan');
    await expect(as(db, 'authenticated', t.uid, () => db.query(`SELECT admin_get_teacher_ic_ciphertext($1, 'saya sendiri')`, [t.id]))).rejects.toThrow(/Hanya pentadbir/);
  });
});

describe('dashboard counts', () => {
  it('reports open work by type', async () => {
    const counts = await asAdmin<{ c: { open_by_type: Record<string, number>; teachers_total: number } }>(`SELECT admin_dashboard_counts() c`);
    expect(counts[0].c.teachers_total).toBeGreaterThan(0);
    expect(typeof counts[0].c.open_by_type).toBe('object');
  });
});
