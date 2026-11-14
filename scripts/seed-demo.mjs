#!/usr/bin/env node
/**
 * MySanad demo data — FICTIONAL records for development and demonstration only.
 *
 *   npm run seed:demo -- --yes        create demo records
 *   npm run seed:demo -- --remove     delete every demo record
 *
 * Every record is fictional, prefixed "[DEMO]", flagged is_demo_record = true, and shown
 * on the site with a "Rekod Demonstrasi (fiksyen)" badge. Demo accounts use the reserved
 * ".invalid" e-mail domain and random passwords that are never printed, so nobody can sign in.
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server-side key).
 */
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

const DEMO_DOMAIN = 'mysanad-demo.invalid';
const args = new Set(process.argv.slice(2));
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY diperlukan (lihat .env.local).');
  process.exit(1);
}
if (!args.has('--yes') && !args.has('--remove')) {
  console.error('Skrip ini menulis ke pangkalan data Supabase anda. Jalankan dengan --yes untuk mencipta, atau --remove untuk memadam.');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

function check(label, { data, error }) {
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function demoUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users.filter((u) => u.email?.endsWith(`@${DEMO_DOMAIN}`)));
    if (data.users.length < 1000) return users;
  }
}

async function remove() {
  const users = await demoUsers();
  for (const u of users) {
    // Cascades: profiles -> teachers -> chains, education, ijazah, contacts, settings.
    check(`padam ${u.email}`, await supabase.auth.admin.deleteUser(u.id));
  }
  check('padam institusi', await supabase.from('institutions').delete().like('name', '[DEMO]%'));
  console.log(`Dipadam: ${users.length} akaun demo dan institusi demo.`);
}

const TEACHERS = [
  { slug: 'kelantan', district: 'kota-bharu', name: 'Ahmad Fiktif bin Rekaan', arabic: 'أحمد فكتيف بن ريكان', alt: ['Ahmad Fiktif'], qiraat: 'Q05-ASIM', riwayat: 'R-HAFS', years: 18, featured: true, inst: 0 },
  { slug: 'kelantan', district: 'pasir-mas', name: 'Aminah Contoh binti Ujian', arabic: 'آمنة', alt: ['Aminah Contoh'], qiraat: 'Q05-ASIM', riwayat: 'R-HAFS', years: 9, inst: 0 },
  { slug: 'terengganu', district: null, name: 'Ismail Sampel bin Demo', arabic: 'إسماعيل سامبل', alt: ['Ismail Sampel'], qiraat: 'Q01-NAFI', riwayat: 'R-WARSH', years: 25, featured: true, inst: 1 },
  { slug: 'selangor', district: null, name: 'Khadijah Rekaan binti Fiktif', arabic: null, alt: [], qiraat: 'Q05-ASIM', riwayat: 'R-HAFS', years: 6, inst: 1 },
  { slug: 'johor', district: null, name: 'Yusuf Contoh bin Sampel', arabic: 'يوسف', alt: ['Yusof Contoh'], qiraat: 'Q10-ASHARAH', riwayat: null, years: 30, featured: true, inst: null },
  { slug: 'sabah', district: null, name: 'Hafsah Ujian binti Rekaan', arabic: 'حفصة', alt: [], qiraat: 'Q05-ASIM', riwayat: 'R-HAFS', years: 4, inst: null },
];

async function seed() {
  if ((await demoUsers()).length > 0) {
    console.error('Rekod demo sudah wujud. Jalankan --remove dahulu jika mahu cipta semula.');
    process.exit(1);
  }
  const states = Object.fromEntries(check('negeri', await supabase.from('malaysian_states').select('id, slug')).map((s) => [s.slug, s.id]));
  const districts = check('daerah', await supabase.from('malaysian_districts').select('id, slug, state_id'));
  const qiraat = Object.fromEntries(check('qiraat', await supabase.from('qiraat_types').select('id, code')).map((q) => [q.code, q.id]));
  const riwayat = Object.fromEntries(check('riwayat', await supabase.from('riwayat_types').select('id, code')).map((r) => [r.code, r.id]));
  const tariq = check('tariq', await supabase.from('tariq_types').select('id').eq('code', 'T-SHATIBIYYAH').maybeSingle());

  const institutions = check(
    'institusi',
    await supabase
      .from('institutions')
      .insert([
        { name: '[DEMO] Maahad Tahfiz Rekaan Kota Bharu', category: 'Maahad Tahfiz', state_id: states.kelantan, is_verified: true },
        { name: '[DEMO] Pusat Pengajian Qiraat Contoh', category: 'Pondok Pengajian', state_id: states.terengganu, is_verified: true },
      ])
      .select('id'),
  );

  for (const [i, t] of TEACHERS.entries()) {
    const email = `demo-${i + 1}@${DEMO_DOMAIN}`;
    const { user } = check(
      email,
      await supabase.auth.admin.createUser({
        email,
        password: randomBytes(24).toString('base64url'),
        email_confirm: true,
        user_metadata: { full_name: `[DEMO] ${t.name}` },
      }),
    );
    const districtId = t.district ? districts.find((d) => d.slug === t.district && d.state_id === states[t.slug])?.id ?? null : null;
    const teacher = check(
      `guru ${t.name}`,
      await supabase
        .from('teachers')
        .insert({
          profile_id: user.id,
          full_name_rumi: `[DEMO] ${t.name}`,
          full_name_arabic: t.arabic,
          public_display_name: `[DEMO] ${t.name}`,
          alternative_spellings: t.alt,
          professional_title: 'Rekod demonstrasi',
          teaching_state_id: states[t.slug],
          teaching_district_id: districtId,
          primary_institution_id: t.inst === null ? null : institutions[t.inst].id,
          primary_qiraat_id: qiraat[t.qiraat] ?? null,
          primary_riwayat_id: t.riwayat ? riwayat[t.riwayat] : null,
          short_bio: 'Ini ialah rekod rekaan untuk tujuan demonstrasi sistem MySanad. Orang ini tidak wujud.',
          teaching_experience_years: t.years,
          specializations: ['Tahsin', 'Talaqqi Musyafahah'],
          profile_verification_status: 'published',
          is_published: true,
          published_at: new Date(Date.now() - i * 86_400_000).toISOString(),
          is_featured: Boolean(t.featured),
          is_demo_record: true,
          sanad_reviewed_badge: i % 2 === 0,
        })
        .select('id')
        .single(),
    );
    check('tetapan', await supabase.from('teacher_public_settings').insert({ teacher_id: teacher.id }));
    check(
      'pendidikan',
      await supabase.from('teacher_education').insert({
        teacher_id: teacher.id,
        institution_name: '[DEMO] Universiti Contoh',
        qualification_level: 'Ijazah Sarjana Muda',
        field_of_study: 'Al-Quran dan Qiraat',
        graduation_year: 2005 + i,
        verification_status: 'approved',
      }),
    );
    if (t.riwayat) {
      check(
        'sanad',
        await supabase.from('sanad_chains').insert({
          teacher_id: teacher.id,
          title: `[DEMO] Sanad ${t.riwayat === 'R-WARSH' ? 'Warsy' : 'Hafs'} (rekaan)`,
          qiraat_id: qiraat[t.qiraat],
          riwayat_id: riwayat[t.riwayat],
          tariq_id: tariq?.id ?? null,
          immediate_teacher_name_rumi: '[DEMO] Syeikh Rekaan',
          ijazah_location: 'Lokasi rekaan',
          public_notes: 'Rekod rekaan untuk demonstrasi. Bukan sanad sebenar.',
          verification_status: 'approved',
          is_public: true,
          is_demo_record: true,
          verified_at: new Date().toISOString(),
        }),
      );
    }
  }
  console.log(`Dicipta: ${TEACHERS.length} guru demo (fiksyen), 2 institusi demo. Padam dengan: npm run seed:demo -- --remove`);
}

try {
  if (args.has('--remove')) await remove();
  else await seed();
} catch (error) {
  console.error('Gagal:', error.message);
  process.exit(1);
}
