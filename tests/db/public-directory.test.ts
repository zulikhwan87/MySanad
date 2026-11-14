/**
 * Phase 2: public search, counts and public profile privacy (migration 006).
 * All records here are fictional test fixtures.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { as, createTestDatabase, signUp, stateId } from './harness';

let db: PGlite;
const ids: Record<string, string> = {};

interface TeacherFixture {
  key: string;
  rumi: string;
  arabic?: string;
  display?: string;
  alt?: string[];
  state: string;
  district?: string;
  institution?: string;
  qiraat?: string;
  riwayat?: string;
  published?: boolean;
}

async function lookup(sql: string, params: unknown[]): Promise<string> {
  const r = await db.query<{ id: string }>(sql, params);
  if (!r.rows[0]) throw new Error(`lookup failed: ${sql} ${JSON.stringify(params)}`);
  return r.rows[0].id;
}

/** Inserts as the database owner (trusted backend), like an admin-approved record. */
async function createTeacher(f: TeacherFixture) {
  const uid = await signUp(db, `${f.key}@ujian.test`);
  const state = await stateId(db, f.state);
  const district = f.district
    ? await lookup(`SELECT id FROM malaysian_districts WHERE slug = $1 AND state_id = $2`, [f.district, state])
    : null;
  const qiraat = f.qiraat ? await lookup(`SELECT id FROM qiraat_types WHERE code = $1`, [f.qiraat]) : null;
  const riwayat = f.riwayat ? await lookup(`SELECT id FROM riwayat_types WHERE code = $1`, [f.riwayat]) : null;
  const published = f.published ?? true;
  const res = await db.query<{ id: string }>(
    `INSERT INTO teachers (profile_id, full_name_rumi, full_name_arabic, public_display_name, alternative_spellings,
        teaching_state_id, teaching_district_id, primary_institution_id, primary_qiraat_id, primary_riwayat_id,
        ic_number_encrypted, private_phone, residential_address,
        profile_verification_status, is_published, published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'IC-RAHSIA-123','+60199999999','Alamat Rahsia Sekali',$11,$12,$13)
     RETURNING id`,
    [
      uid, f.rumi, f.arabic ?? null, f.display ?? f.rumi, f.alt ?? [], state, district, f.institution ?? null,
      qiraat, riwayat, published ? 'published' : 'submitted', published, published ? new Date().toISOString() : null,
    ],
  );
  ids[f.key] = res.rows[0].id;
  return res.rows[0].id;
}

async function search(args: Record<string, unknown> = {}) {
  const res = await as(db, 'anon', null, () =>
    db.query<{ id: string; total_count: string; approved_sanad_count: number; relevance: number }>(
      `SELECT * FROM search_public_teachers(
         p_query => $1, p_state_slug => $2, p_district_id => $3, p_qiraat_id => $4,
         p_riwayat_id => $5, p_institution_id => $6, p_limit => $7, p_offset => $8)`,
      [
        args.q ?? null, args.state ?? null, args.district ?? null, args.qiraat ?? null,
        args.riwayat ?? null, args.institution ?? null, args.limit ?? 12, args.offset ?? 0,
      ],
    ),
  );
  return res.rows;
}

beforeAll(async () => {
  db = await createTestDatabase();
  const kelantan = await stateId(db, 'kelantan');
  ids.instKB = await lookup(
    `INSERT INTO institutions (name, category, state_id, is_verified) VALUES ('Maahad Tahfiz Ujian Kota Bharu', 'Maahad Tahfiz', $1, TRUE) RETURNING id`,
    [kelantan],
  );
  ids.instHidden = await lookup(
    `INSERT INTO institutions (name, category, state_id) VALUES ('Pondok Tanpa Guru Ujian', 'Pondok Pengajian', $1) RETURNING id`,
    [kelantan],
  );

  await createTeacher({
    key: 'abdullah',
    rumi: 'Abdullah bin Ismail (Ujian)',
    arabic: 'عَبْدُ ٱللَّهِ بْنُ إِسْمَاعِيل',
    alt: ['Abdollah Ismail'],
    state: 'kelantan',
    district: 'kota-bharu',
    institution: ids.instKB,
    qiraat: 'Q05-ASIM',
    riwayat: 'R-HAFS',
  });
  await createTeacher({ key: 'fatimah', rumi: 'Fatimah binti Yusof (Ujian)', state: 'selangor' });
  await createTeacher({ key: 'draft', rumi: 'Guru Belum Terbit (Ujian)', state: 'kelantan', published: false });
  for (let i = 0; i < 13; i += 1) {
    await createTeacher({ key: `bulk${i}`, rumi: `Guru Pukal ${String(i).padStart(2, '0')} (Ujian)`, state: 'johor' });
  }

  // One public, approved sanad chain for Abdullah; one private chain that must not be counted.
  const q = await lookup(`SELECT id FROM qiraat_types WHERE code = 'Q01-NAFI'`, []);
  const r = await lookup(`SELECT id FROM riwayat_types WHERE code = 'R-WARSH'`, []);
  await db.query(
    `INSERT INTO sanad_chains (teacher_id, title, qiraat_id, riwayat_id, immediate_teacher_name_rumi,
       verification_status, is_public, internal_notes, ijazah_date)
     VALUES ($1, 'Sanad Warsh (Ujian)', $2, $3, 'Syeikh Ujian', 'approved', TRUE, 'NOTA-DALAMAN-RAHSIA', '2020-01-15'),
            ($1, 'Sanad Draf (Ujian)', $2, $3, 'Syeikh Ujian', 'draft', FALSE, NULL, NULL)`,
    [ids.abdullah, q, r],
  );
  await db.query(
    `INSERT INTO teacher_education (teacher_id, institution_name, qualification_level, field_of_study, verification_status)
     VALUES ($1, 'Universiti Ujian', 'Ijazah Sarjana Muda', 'Al-Quran dan Qiraat', 'approved')`,
    [ids.abdullah],
  );
  await db.query(
    `INSERT INTO ijazah_records (teacher_id, ijazah_title, granting_sheikh_rumi, conferral_date, verification_status, is_public)
     VALUES ($1, 'Ijazah Hafs (Ujian)', 'Syeikh Ujian', '2019-06-01', 'approved', TRUE)`,
    [ids.abdullah],
  );
  await db.query(
    `INSERT INTO public_contact_channels (teacher_id, channel_type, label, contact_value, is_approved)
     VALUES ($1, 'Emel Rasmi', 'Emel kelas', 'kelas@ujian.test', TRUE),
            ($1, 'Telegram Pengajian', 'Belum lulus', 't.me/belum', FALSE)`,
    [ids.abdullah],
  );
});

describe('normalize_search_text', () => {
  it('folds case, Arabic diacritics and letter variants', async () => {
    const r = await db.query<{ a: string; b: string; c: string }>(
      `SELECT normalize_search_text('ABDULLAH  Bin-Ismail') a,
              normalize_search_text('عَبْدُ ٱللَّهِ') b,
              normalize_search_text('Nafi''') c`,
    );
    expect(r.rows[0]).toEqual({ a: 'abdullah bin ismail', b: 'عبد الله', c: 'nafi' });
  });
});

describe('search_public_teachers', () => {
  it('returns only published teachers', async () => {
    const rows = await search({ limit: 50 });
    expect(rows).toHaveLength(15);
    expect(rows.map((r) => r.id)).not.toContain(ids.draft);
  });

  it('matches full, partial and case-insensitive names', async () => {
    expect((await search({ q: 'Abdullah bin Ismail' })).map((r) => r.id)).toEqual([ids.abdullah]);
    expect((await search({ q: 'ismail' })).map((r) => r.id)).toEqual([ids.abdullah]);
    expect((await search({ q: 'FATIMAH' })).map((r) => r.id)).toEqual([ids.fatimah]);
  });

  it('matches Arabic names with or without harakat', async () => {
    expect((await search({ q: 'عبد الله' })).map((r) => r.id)).toEqual([ids.abdullah]);
    expect((await search({ q: 'إسماعيل' })).map((r) => r.id)).toEqual([ids.abdullah]);
  });

  it('matches alternative spellings and near-misses', async () => {
    expect((await search({ q: 'Abdollah' })).map((r) => r.id)).toEqual([ids.abdullah]);
    expect((await search({ q: 'Abdulah Ismail' })).map((r) => r.id)).toContain(ids.abdullah);
  });

  it('matches institution, state and district text', async () => {
    expect((await search({ q: 'Maahad Tahfiz Ujian' })).map((r) => r.id)).toEqual([ids.abdullah]);
    expect((await search({ q: 'kota bharu' })).map((r) => r.id)).toEqual([ids.abdullah]);
  });

  it('filters by state, district, institution, qiraat and riwayat', async () => {
    const kb = await lookup(`SELECT id FROM malaysian_districts WHERE slug = 'kota-bharu'`, []);
    const asim = await lookup(`SELECT id FROM qiraat_types WHERE code = 'Q05-ASIM'`, []);
    const nafi = await lookup(`SELECT id FROM qiraat_types WHERE code = 'Q01-NAFI'`, []);
    const warsh = await lookup(`SELECT id FROM riwayat_types WHERE code = 'R-WARSH'`, []);

    expect((await search({ state: 'kelantan' })).map((r) => r.id)).toEqual([ids.abdullah]);
    expect((await search({ state: 'selangor' })).map((r) => r.id)).toEqual([ids.fatimah]);
    expect((await search({ district: kb })).map((r) => r.id)).toEqual([ids.abdullah]);
    expect((await search({ institution: ids.instKB })).map((r) => r.id)).toEqual([ids.abdullah]);
    expect((await search({ qiraat: asim })).map((r) => r.id)).toEqual([ids.abdullah]); // primary
    expect((await search({ qiraat: nafi })).map((r) => r.id)).toEqual([ids.abdullah]); // via public chain
    expect((await search({ riwayat: warsh })).map((r) => r.id)).toEqual([ids.abdullah]);
    expect(await search({ state: 'perlis' })).toEqual([]);
  });

  it('paginates with a stable total count', async () => {
    const page1 = await search({ state: 'johor', limit: 5, offset: 0 });
    const page3 = await search({ state: 'johor', limit: 5, offset: 10 });
    expect(page1).toHaveLength(5);
    expect(page3).toHaveLength(3);
    expect(Number(page1[0].total_count)).toBe(13);
    expect(new Set([...page1, ...page3].map((r) => r.id)).size).toBe(8);
  });

  it('clamps abusive limits', async () => {
    expect(await search({ limit: 100000 })).toHaveLength(15);
    expect((await search({ limit: -5 })).length).toBe(1);
  });

  it('counts only public approved sanad chains and exposes no private columns', async () => {
    const [row] = await search({ q: 'abdullah' });
    expect(row.approved_sanad_count).toBe(1);
    const text = JSON.stringify(row);
    for (const secret of ['IC-RAHSIA', '+60199999999', 'Alamat Rahsia', 'NOTA-DALAMAN']) {
      expect(text).not.toContain(secret);
    }
  });
});

describe('public counts', () => {
  it('reports real per-state counts for all 16 states', async () => {
    const rows = await as(db, 'anon', null, async () =>
      (await db.query<{ slug: string; teacher_count: number }>(`SELECT slug, teacher_count FROM v_public_state_stats`)).rows,
    );
    const bySlug = Object.fromEntries(rows.map((r) => [r.slug, r.teacher_count]));
    expect(rows).toHaveLength(16);
    expect(bySlug.kelantan).toBe(1); // unpublished teacher not counted
    expect(bySlug.johor).toBe(13);
    expect(bySlug.perlis).toBe(0);
  });

  it('lists institutions that are verified or have published teachers', async () => {
    const rows = await as(db, 'anon', null, async () =>
      (await db.query<{ id: string; teacher_count: number }>(`SELECT id, teacher_count FROM v_public_institutions`)).rows,
    );
    expect(rows).toEqual([{ id: ids.instKB, teacher_count: 1 }]);
  });

  it('computes platform statistics from real records', async () => {
    const r = await as(db, 'anon', null, async () =>
      (await db.query<{ s: Record<string, number> }>(`SELECT public_platform_stats() AS s`)).rows[0].s,
    );
    expect(r).toEqual({ teachers: 15, demo_teachers: 0, sanad_chains: 1, states_with_teachers: 3, institutions: 1 });
  });
});

describe('get_public_teacher_profile', () => {
  async function profile(id: string) {
    return as(db, 'anon', null, async () =>
      (await db.query<{ p: Record<string, unknown> | null }>(`SELECT get_public_teacher_profile($1) AS p`, [id])).rows[0].p,
    );
  }

  it('returns null for unpublished or unknown teachers', async () => {
    expect(await profile(ids.draft)).toBeNull();
    expect(await profile('00000000-0000-0000-0000-000000000000')).toBeNull();
  });

  it('returns public sections without any private data', async () => {
    const p = (await profile(ids.abdullah)) as Record<string, unknown[]> & { teacher: Record<string, unknown> };
    expect(p.teacher.id).toBe(ids.abdullah);
    expect(p.sanad_chains).toHaveLength(1);
    expect(p.education).toHaveLength(1);
    expect(p.ijazah).toHaveLength(1);
    expect(p.contacts).toHaveLength(1); // unapproved contact hidden
    const text = JSON.stringify(p);
    for (const secret of ['IC-RAHSIA', '+60199999999', 'Alamat Rahsia', 'NOTA-DALAMAN', 'Sanad Draf', 't.me/belum']) {
      expect(text).not.toContain(secret);
    }
  });

  it('honours the teacher visibility settings', async () => {
    await db.query(
      `INSERT INTO teacher_public_settings (teacher_id, show_education, show_ijazah_dates, show_public_contact, show_institution, show_photo)
       VALUES ($1, FALSE, FALSE, FALSE, FALSE, FALSE)`,
      [ids.abdullah],
    );
    const p = (await profile(ids.abdullah)) as Record<string, unknown> & {
      teacher: Record<string, unknown>;
      ijazah: Array<Record<string, unknown>>;
      sanad_chains: Array<Record<string, unknown>>;
    };
    expect(p.education).toEqual([]);
    expect(p.contacts).toEqual([]);
    expect(p.institution).toBeNull();
    expect(p.teacher.institution_name).toBeNull();
    expect(p.teacher.photo_url).toBeNull();
    expect(p.ijazah[0].conferral_date).toBeNull();
    expect(p.sanad_chains[0].ijazah_date).toBeNull();
    // Hidden institution must not be searchable either.
    expect((await search({ q: 'Maahad Tahfiz Ujian' })).map((r) => r.id)).toEqual([]);
  });

  it('blocks direct public reads of education, ijazah and contact tables', async () => {
    for (const table of ['teacher_education', 'ijazah_records', 'public_contact_channels']) {
      const rows = await as(db, 'anon', null, async () => (await db.query(`SELECT id FROM ${table}`)).rows);
      expect(rows).toEqual([]);
    }
  });
});
