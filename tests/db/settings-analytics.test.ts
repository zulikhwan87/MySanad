/**
 * Phase 7: system settings, analytics and reference data (migration 011). Fictional fixtures.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createTestDatabase, setRoleAsOwner, signUp, stateId } from './harness';

let db: PGlite;
let verifier: string;
let superAdmin: string;
let teacher: string;

const setAs = (uid: string, key: string, value: unknown) =>
  as(db, 'authenticated', uid, () => db.query(`UPDATE system_settings SET value = $2::jsonb WHERE key = $1`, [key, JSON.stringify(value)]));

beforeAll(async () => {
  db = await createTestDatabase();
  verifier = await signUp(db, 'pengesah-tetapan@ujian.test');
  superAdmin = await signUp(db, 'super-tetapan@ujian.test');
  teacher = await signUp(db, 'guru-tetapan@ujian.test');
  await setRoleAsOwner(db, verifier, 'verification_admin');
  await setRoleAsOwner(db, superAdmin, 'super_admin');
});

describe('system settings', () => {
  it('exposes only public settings to visitors', async () => {
    const rows = await as(db, 'anon', null, async () => (await db.query<{ key: string }>(`SELECT key FROM system_settings ORDER BY key`)).rows);
    expect(rows.map((r) => r.key)).toEqual(['announcement', 'contact_email', 'registration_open']);
    const admin = await as(db, 'authenticated', verifier, async () => (await db.query(`SELECT key FROM system_settings`)).rows);
    expect(admin).toHaveLength(4);
  });

  it('lets only the Super Admin change settings, with typed validation', async () => {
    const res = await setAs(verifier, 'announcement', 'Cubaan');
    expect(res.affectedRows).toBe(0);
    await setAs(superAdmin, 'announcement', 'Sistem dalam penyelenggaraan malam ini.');
    const row = await db.query<{ v: string; updated_by: string }>(`SELECT value #>> '{}' v, updated_by FROM system_settings WHERE key = 'announcement'`);
    expect(row.rows[0]).toEqual({ v: 'Sistem dalam penyelenggaraan malam ini.', updated_by: superAdmin });

    await expect(setAs(superAdmin, 'registration_open', 'ya')).rejects.toThrow(/benar\/palsu/);
    await expect(setAs(superAdmin, 'announcement', 'x'.repeat(301))).rejects.toThrow(/300 aksara/);
    await expect(setAs(superAdmin, 'contact_email', 'bukan-emel')).rejects.toThrow(/emel tidak sah/);
    await expect(setAs(superAdmin, 'max_documents_per_teacher', 0)).rejects.toThrow(/antara 1 dan 200/);
    await expect(setAs(superAdmin, 'max_documents_per_teacher', 2.5)).rejects.toThrow(/nombor bulat/);
    await setAs(superAdmin, 'contact_email', null);
    await setAs(superAdmin, 'contact_email', 'urusetia@contoh.test');
  });

  it('cannot add or remove setting keys', async () => {
    await expect(
      as(db, 'authenticated', superAdmin, () => db.query(`INSERT INTO system_settings (key, value) VALUES ('registration_open', 'true')`)),
    ).rejects.toThrow(/permission denied/);
    await expect(as(db, 'authenticated', superAdmin, () => db.query(`DELETE FROM system_settings`))).rejects.toThrow(/permission denied/);
  });

  it('drives the document limit', async () => {
    await setAs(superAdmin, 'max_documents_per_teacher', 7);
    expect((await db.query<{ n: number }>(`SELECT max_documents_per_teacher() n`)).rows[0].n).toBe(7);
  });

  it('closing registration blocks new accounts at the database, even via the Auth API', async () => {
    await setAs(superAdmin, 'registration_open', false);
    await expect(signUp(db, 'terlambat@ujian.test')).rejects.toThrow(/Pendaftaran akaun baharu ditutup/);
    await setAs(superAdmin, 'registration_open', true);
    await expect(signUp(db, 'tepat-masa@ujian.test')).resolves.toBeTruthy();
  });

  it('records setting changes in the audit log', async () => {
    const rows = await db.query(`SELECT 1 FROM audit_logs WHERE entity_table = 'system_settings' AND action = 'UPDATE'`);
    expect(rows.rows.length).toBeGreaterThan(0);
  });
});

describe('reference data', () => {
  it('lets administrators manage districts but not teachers', async () => {
    const kel = await stateId(db, 'kelantan');
    await as(db, 'authenticated', verifier, () =>
      db.query(`INSERT INTO malaysian_districts (state_id, name, slug) VALUES ($1, 'Daerah Ujian', 'daerah-ujian')`, [kel]),
    );
    await expect(
      as(db, 'authenticated', teacher, () =>
        db.query(`INSERT INTO malaysian_districts (state_id, name, slug) VALUES ($1, 'Daerah Guru', 'daerah-guru')`, [kel]),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as(db, 'authenticated', verifier, () =>
        db.query(`INSERT INTO malaysian_districts (state_id, name, slug) VALUES ($1, 'Slug Buruk', 'Slug Buruk!')`, [kel]),
      ),
    ).rejects.toThrow(/check constraint/);
    // Deactivated districts disappear for the public.
    await as(db, 'authenticated', verifier, () => db.query(`UPDATE malaysian_districts SET is_active = FALSE WHERE slug = 'daerah-ujian'`));
    const pub = await as(db, 'anon', null, async () => (await db.query(`SELECT id FROM malaysian_districts WHERE slug = 'daerah-ujian'`)).rows);
    expect(pub).toEqual([]);
  });

  it('reserves qiraat/riwayat/tariq edits for the Super Admin', async () => {
    const res = await as(db, 'authenticated', verifier, () => db.query(`UPDATE qiraat_types SET description = 'x' WHERE code = 'Q05-ASIM'`));
    expect(res.affectedRows).toBe(0);
    await as(db, 'authenticated', superAdmin, () =>
      db.query(`INSERT INTO tariq_types (code, name_rumi, name_arabic) VALUES ('T-UJIAN', 'Tariq Ujian', 'طريق')`),
    );
    await expect(
      as(db, 'authenticated', superAdmin, () => db.query(`INSERT INTO tariq_types (code, name_rumi, name_arabic) VALUES ('t ujian', 'x', 'y')`)),
    ).rejects.toThrow(/check constraint/);
  });

  it('lets administrators curate approved reference transmitters with unique codes', async () => {
    await as(db, 'authenticated', verifier, () =>
      db.query(
        `INSERT INTO sanad_nodes (canonical_code, full_name_rumi, full_name_arabic, generation_category, verification_status, is_public)
         VALUES ('REF-UJIAN-1', 'Perawi Rujukan Ujian', 'راوي', 'Imam Qiraat', 'approved', TRUE)`,
      ),
    );
    await expect(
      as(db, 'authenticated', verifier, () =>
        db.query(`INSERT INTO sanad_nodes (canonical_code, full_name_rumi, full_name_arabic, generation_category) VALUES ('REF-UJIAN-1', 'Lain', 'x', 'Perawi')`),
      ),
    ).rejects.toThrow(/duplicate key/);
    // Teachers can find and link it explicitly.
    const kel = await stateId(db, 'kelantan');
    await as(db, 'authenticated', teacher, () =>
      db.query(`INSERT INTO teachers (profile_id, full_name_rumi, public_display_name, teaching_state_id) VALUES ($1, 'Guru', 'Guru', $2)`, [teacher, kel]),
    );
    const found = await as(db, 'authenticated', teacher, async () =>
      (await db.query<{ full_name_rumi: string }>(`SELECT full_name_rumi FROM search_linkable_sanad_nodes('perawi rujukan')`)).rows,
    );
    expect(found.map((r) => r.full_name_rumi)).toContain('Perawi Rujukan Ujian');
  });
});

describe('admin_analytics', () => {
  it('is for administrators only and returns 12 months of real counts', async () => {
    await expect(as(db, 'authenticated', teacher, () => db.query(`SELECT admin_analytics()`))).rejects.toThrow(/Hanya pentadbir/);
    const a = await as(db, 'authenticated', verifier, async () =>
      (await db.query<{ a: { months: Array<{ month: string; registered: number }>; published_by_state: unknown[]; teachers_by_status: Record<string, number> } }>(
        `SELECT admin_analytics() a`,
      )).rows[0].a,
    );
    expect(a.months).toHaveLength(12);
    expect(a.months.at(-1)!.registered).toBeGreaterThanOrEqual(1);
    expect(a.published_by_state).toHaveLength(16);
    expect(a.teachers_by_status.draft).toBeGreaterThanOrEqual(1);
  });
});
