#!/usr/bin/env node
/**
 * Live end-to-end check of the teacher → administrator workflow against the Supabase project in .env.local.
 *
 *   node --env-file=.env.local scripts/db/live-workflow-check.mjs
 *
 * Creates two temporary accounts (teacher + verification admin) with random passwords that are never printed,
 * walks profile → sanad → document → review → publication → public visibility, then deletes everything it created
 * (accounts, teacher, sanad nodes, storage object). Audit log rows are append-only and remain by design.
 * All records are labelled [UJIAN] and are fictional.
 */
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY dan SUPABASE_SERVICE_ROLE_KEY diperlukan.');
  process.exit(1);
}
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(url, serviceKey, opts);
const anon = createClient(url, anonKey, opts);

const results = [];
let failed = 0;
function pass(name, detail = '') {
  results.push(`LULUS  ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail) {
  failed += 1;
  results.push(`GAGAL  ${name} — ${detail}`);
}
async function step(name, fn) {
  try {
    const detail = await fn();
    pass(name, typeof detail === 'string' ? detail : '');
    return true;
  } catch (e) {
    fail(name, e instanceof Error ? e.message : String(e));
    return false;
  }
}
function must({ data, error }, what) {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const tag = randomBytes(4).toString('hex');
const created = { users: [], nodes: [], storage: [] };
const ctx = {};

async function makeUser(label, fullName) {
  const email = `mysanad-ujian-${label}-${tag}@example.invalid`;
  const password = randomBytes(24).toString('base64url');
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw new Error(`cipta ${label}: ${error.message}`);
  created.users.push(data.user.id);
  const client = createClient(url, anonKey, opts);
  must(await client.auth.signInWithPassword({ email, password }), `log masuk ${label}`);
  return { id: data.user.id, client };
}

async function run() {
  // ---------- accounts ----------
  if (
    !(await step('Cipta akaun guru ujian; profil dicipta dengan peranan registered_teacher', async () => {
      ctx.teacher = await makeUser('guru', '[UJIAN] Guru Aliran');
      const p = must(await ctx.teacher.client.from('profiles').select('role').eq('id', ctx.teacher.id).single(), 'profil');
      assert(p.role === 'registered_teacher', `peranan ${p.role}`);
    }))
  )
    return;
  if (
    !(await step('Cipta akaun pentadbir pengesahan ujian', async () => {
      ctx.admin = await makeUser('pentadbir', '[UJIAN] Pentadbir Aliran');
      must(await service.from('profiles').update({ role: 'verification_admin' }).eq('id', ctx.admin.id), 'tetapkan peranan');
    }))
  )
    return;

  await step('Guru tidak boleh menaikkan peranan sendiri', async () => {
    await ctx.teacher.client.from('profiles').update({ role: 'super_admin' }).eq('id', ctx.teacher.id);
    const p = must(await service.from('profiles').select('role').eq('id', ctx.teacher.id).single(), 'profil');
    assert(p.role === 'registered_teacher', `peranan berubah kepada ${p.role}`);
  });

  // ---------- teacher profile ----------
  const t = ctx.teacher.client;
  const ref = {};
  await step('Baca data rujukan (negeri, qiraat, riwayat)', async () => {
    ref.state = must(await t.from('malaysian_states').select('id').eq('slug', 'selangor').single(), 'negeri').id;
    ref.qiraat = must(await t.from('qiraat_types').select('id').eq('code', 'Q05-ASIM').single(), 'qiraat').id;
    ref.riwayat = must(await t.from('riwayat_types').select('id').eq('code', 'R-HAFS').single(), 'riwayat').id;
  });

  if (
    !(await step('Guru mencipta profil dan pendidikan', async () => {
      const row = must(
        await t
          .from('teachers')
          .insert({
            profile_id: ctx.teacher.id,
            full_name_rumi: `[UJIAN] Guru Aliran ${tag}`,
            full_name_arabic: 'معلم الاختبار',
            public_display_name: `[UJIAN] Guru Aliran ${tag}`,
            teaching_state_id: ref.state,
            primary_qiraat_id: ref.qiraat,
            primary_riwayat_id: ref.riwayat,
            short_bio: 'Rekod ujian automatik sementara. Akan dipadam selepas ujian.',
          })
          .select('id, teacher_code')
          .single(),
        'teachers',
      );
      ctx.teacherId = row.id;
      must(
        await t
          .from('teacher_education')
          .insert({ teacher_id: row.id, institution_name: '[UJIAN] Institut', qualification_level: 'Diploma', field_of_study: 'Qiraat' }),
        'pendidikan',
      );
      return row.teacher_code ?? '';
    }))
  )
    return;

  await step('Profil draf tidak kelihatan kepada awam', async () => {
    const rows = must(await anon.from('v_public_teachers').select('id').eq('id', ctx.teacherId), 'view awam');
    assert(rows.length === 0, 'profil draf kelihatan');
  });

  // ---------- sanad ----------
  await step('Guru membina rantaian sanad (nod diri, syeikh, hubungan)', async () => {
    ctx.selfNode = must(await t.rpc('ensure_my_sanad_node'), 'ensure_my_sanad_node');
    created.nodes.push(ctx.selfNode);
    const sheikh = must(
      await t
        .from('sanad_nodes')
        .insert({ full_name_rumi: `[UJIAN] Syeikh Rekaan ${tag}`, full_name_arabic: 'شيخ الاختبار', alternative_spellings: [], generation_category: 'Masyaikh Mutaakhirin' })
        .select('id')
        .single(),
      'nod syeikh',
    ).id;
    created.nodes.push(sheikh);
    ctx.chainId = must(
      await t
        .from('sanad_chains')
        .insert({ teacher_id: ctx.teacherId, title: `[UJIAN] Sanad Hafs ${tag}`, qiraat_id: ref.qiraat, riwayat_id: ref.riwayat })
        .select('id')
        .single(),
      'rantaian',
    ).id;
    must(
      await t.from('sanad_edges').insert({ sanad_chain_id: ctx.chainId, source_node_id: sheikh, target_node_id: ctx.selfNode, supporting_evidence: 'BUKTI-SULIT-UJIAN' }),
      'hubungan',
    );
  });

  // ---------- document ----------
  await step('Guru memuat naik PDF ke bucket peribadi dan mendaftarkannya', async () => {
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n');
    ctx.docPath = `${ctx.teacher.id}/${randomUUID()}.pdf`;
    must(await t.storage.from('private-ijazah-documents').upload(ctx.docPath, pdf, { contentType: 'application/pdf' }), 'muat naik');
    created.storage.push(ctx.docPath);
    ctx.docId = must(
      await t.rpc('register_my_document', {
        p_storage_path: ctx.docPath,
        p_category: 'Sijil Ijazah Sanad',
        p_original_filename: 'ujian-ijazah.pdf',
        p_mime_type: 'application/pdf',
        p_file_size_bytes: pdf.length,
        p_sanad_chain_id: ctx.chainId,
        p_show_publicly: true,
      }),
      'register_my_document',
    );
  });

  await step('Guru lain / awam tidak boleh muat turun dokumen peribadi', async () => {
    const { error } = await anon.storage.from('private-ijazah-documents').download(ctx.docPath);
    assert(error, 'awam berjaya memuat turun');
    const rows = must(await anon.from('documents').select('id').eq('id', ctx.docId), 'documents');
    assert(rows.length === 0, 'awam boleh membaca rekod dokumen');
  });

  await step('Guru boleh mendapat URL bertandatangan untuk dokumen sendiri', async () => {
    const s = must(await t.storage.from('private-ijazah-documents').createSignedUrl(ctx.docPath, 60), 'signed url');
    const res = await fetch(s.signedUrl);
    assert(res.ok, `HTTP ${res.status}`);
  });

  // ---------- submissions ----------
  await step('Guru menghantar profil dan rantaian sanad untuk semakan', async () => {
    ctx.profileSub = must(await t.rpc('submit_my_teacher_profile', { p_notes: 'Ujian automatik' }), 'hantar profil');
    ctx.sanadSub = must(await t.rpc('submit_my_sanad_chain', { p_chain_id: ctx.chainId, p_notes: 'Ujian automatik' }), 'hantar sanad');
  });

  await step('Guru tidak boleh memanggil fungsi pentadbir', async () => {
    const { error } = await t.rpc('admin_decide_submission', { p_submission_id: ctx.profileSub, p_decision: 'publish' });
    assert(error, 'guru berjaya membuat keputusan');
  });

  // ---------- admin review ----------
  const a = ctx.admin.client;
  await step('Pentadbir melihat barisan semakan dan halaman guru (rentetan pertanyaan portal)', async () => {
    const subs = must(
      await a
        .from('verification_submissions')
        .select('id, submission_code, target_type, status, submitted_at, teacher:teachers(id, public_display_name, teacher_code)')
        .eq('teacher_id', ctx.teacherId),
      'barisan',
    );
    const types = subs.map((s) => s.target_type).sort();
    ctx.subs = subs;
    must(
      await a
        .from('teachers')
        .select(
          'id, teacher_code, public_display_name, profile_verification_status, profile:profiles(email), teaching_state:malaysian_states!teachers_teaching_state_id_fkey(name)',
        )
        .eq('id', ctx.teacherId)
        .single(),
      'butiran guru',
    );
    must(
      await a
        .from('documents')
        .select('id, category, original_filename, review_status, ijazah:ijazah_records(ijazah_title), chain:sanad_chains(id, title)')
        .eq('teacher_id', ctx.teacherId),
      'dokumen',
    );
    return `${subs.length} permohonan: ${types.join(', ')}`;
  });

  await step('Pentadbir membuka URL bertandatangan dokumen guru', async () => {
    const s = must(await a.storage.from('private-ijazah-documents').createSignedUrl(ctx.docPath, 60), 'signed url');
    assert((await fetch(s.signedUrl)).ok, 'gagal dimuat turun');
  });

  await step('Pentadbir memulakan semakan profil; guru dimaklumkan', async () => {
    must(await a.rpc('admin_start_review', { p_submission_id: ctx.profileSub }), 'mula semak');
    const st = must(await service.from('teachers').select('profile_verification_status').eq('id', ctx.teacherId).single(), 'status');
    assert(st.profile_verification_status === 'under_review', st.profile_verification_status);
  });

  await step('Profil dikunci semasa semakan (guru tidak boleh mengubah)', async () => {
    await ctx.teacher.client.from('teachers').update({ short_bio: 'cubaan ubah' }).eq('id', ctx.teacherId);
    const r = must(await service.from('teachers').select('short_bio').eq('id', ctx.teacherId).single(), 'teachers');
    assert(r.short_bio !== 'cubaan ubah', 'profil berubah semasa disemak');
  });

  await step('Pentadbir menerbitkan profil (dengan nota dalaman)', async () => {
    must(
      await a.rpc('admin_decide_submission', {
        p_submission_id: ctx.profileSub,
        p_decision: 'publish',
        p_public_feedback: 'Tahniah, profil diterbitkan.',
        p_internal_comment: 'NOTA-DALAMAN-UJIAN',
        p_checklist: { identiti: true },
      }),
      'terbit',
    );
  });

  await step('Pentadbir meluluskan rantaian sanad', async () => {
    must(await a.rpc('admin_decide_submission', { p_submission_id: ctx.sanadSub, p_decision: 'approve' }), 'lulus sanad');
  });

  await step('Pentadbir meluluskan dokumen', async () => {
    const docSub = (ctx.subs ?? []).find((s) => s.target_type === 'ijazah_document');
    if (docSub) must(await a.rpc('admin_decide_submission', { p_submission_id: docSub.id, p_decision: 'approve' }), 'lulus dokumen');
    else must(await a.rpc('admin_set_item_status', { p_table: 'documents', p_id: ctx.docId, p_status: 'approved' }), 'lulus dokumen');
    const d = must(await service.from('documents').select('review_status').eq('id', ctx.docId).single(), 'dokumen');
    return `status ${d.review_status}${docSub ? ' (melalui permohonan)' : ' (terus)'}`;
  });

  // ---------- public visibility ----------
  await step('Profil kini dalam carian awam (Rumi)', async () => {
    const r = must(await anon.rpc('search_public_teachers', { p_query: `Guru Aliran ${tag}` }), 'carian');
    const items = Array.isArray(r) ? r : (r.items ?? []);
    assert(items.some((i) => i.id === ctx.teacherId), 'tidak ditemui');
  });

  await step('Profil awam tidak mendedahkan maklumat sulit', async () => {
    const p = must(await anon.rpc('get_public_teacher_profile', { p_teacher_id: ctx.teacherId }), 'profil awam');
    const s = JSON.stringify(p);
    assert(s.includes(ctx.teacherId), 'profil tiada');
    for (const secret of ['NOTA-DALAMAN-UJIAN', 'BUKTI-SULIT-UJIAN', 'example.invalid', ctx.docPath]) assert(!s.includes(secret), `bocor: ${secret.slice(0, 20)}`);
  });

  await step('Graf sanad awam memaparkan hubungan yang diluluskan', async () => {
    const g = must(await anon.rpc('get_public_sanad_graph', { p_teacher_id: ctx.teacherId }), 'graf');
    assert(g.edges.length >= 1, `hubungan ${g.edges.length}`);
    assert(!JSON.stringify(g).includes('BUKTI-SULIT-UJIAN'), 'bukti sulit bocor');
    return `${g.nodes.length} nod, ${g.edges.length} hubungan`;
  });

  await step('Sijil sanad yang diminta dipaparkan kepada awam selepas lulus (tanpa nama fail/laluan)', async () => {
    const docs = must(await anon.rpc('get_public_sanad_documents', { p_teacher_id: ctx.teacherId }), 'dokumen awam');
    assert(docs.length === 1 && docs[0].id === ctx.docId, `dokumen awam ${docs.length}`);
    const s = JSON.stringify(docs);
    assert(!s.includes('ujian-ijazah') && !s.includes(ctx.teacher.id), 'nama fail atau laluan bocor');
    const { error } = await anon.rpc('public_sanad_document_path', { p_document_id: ctx.docId });
    assert(error, 'awam boleh membaca laluan storan');
  });

  const appUrl = process.env.LIVE_CHECK_APP_URL;
  if (appUrl) {
    await step(`Butang "Papar sanad" di ${appUrl} membuka PDF`, async () => {
      const res = await fetch(`${appUrl}/api/public-documents/${ctx.docId}`, { redirect: 'manual' });
      assert(res.status === 302, `HTTP ${res.status}`);
      const pdf = await fetch(res.headers.get('location'));
      const head = Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString();
      assert(pdf.ok && head === '%PDF-', `fail ${pdf.status} ${head}`);
      const page = await (await fetch(`${appUrl}/directory/${ctx.teacherId}`)).text();
      assert(page.includes('Papar Sanad'), 'tab Papar Sanad tiada dalam profil');
    });
  }

  await step('Guru menyembunyikan sijil; ia hilang serta-merta', async () => {
    must(await t.rpc('set_my_document_public', { p_document_id: ctx.docId, p_show: false }), 'sembunyi');
    const docs = must(await anon.rpc('get_public_sanad_documents', { p_teacher_id: ctx.teacherId }), 'dokumen awam');
    assert(docs.length === 0, 'masih dipaparkan');
  });

  await step('Guru menerima notifikasi tanpa nota dalaman', async () => {
    const n = must(await t.from('notifications').select('notification_type, message'), 'notifikasi');
    const types = n.map((x) => x.notification_type);
    assert(types.includes('profile_published'), `jenis: ${types.join(', ')}`);
    assert(!JSON.stringify(n).includes('NOTA-DALAMAN-UJIAN'), 'nota dalaman bocor');
    const reviews = must(await t.from('verification_reviews').select('id'), 'semakan');
    assert(reviews.length === 0, 'guru boleh membaca semakan dalaman');
    return types.join(', ');
  });

  await step('Log audit merekod tindakan', async () => {
    const rows = must(await service.from('audit_logs').select('action').eq('entity_id', ctx.teacherId), 'audit');
    assert(rows.length > 0, 'tiada log');
    return `${rows.length} entri untuk guru`;
  });
}

async function cleanup() {
  const notes = [];
  if (created.storage.length) {
    const { error } = await service.storage.from('private-ijazah-documents').remove(created.storage);
    notes.push(error ? `fail: ${error.message}` : 'fail dipadam');
  }
  // Teacher first: cascades teacher, chains, edges, documents, submissions and reviews (reviews block deleting the admin).
  for (const id of created.users) {
    const { error } = await service.auth.admin.deleteUser(id);
    notes.push(error ? `akaun: ${error.message}` : 'akaun dipadam');
  }
  if (created.nodes.length) {
    const { error } = await service.from('sanad_nodes').delete().in('id', created.nodes);
    notes.push(error ? `nod: ${error.message}` : 'nod dipadam');
  }
  const left = must(await service.from('teachers').select('id').like('public_display_name', `%${tag}%`), 'semak baki');
  notes.push(left.length ? `BAKI ${left.length} guru` : 'tiada baki guru');
  return notes;
}

try {
  await run();
} catch (e) {
  fail('Ralat tidak dijangka', e instanceof Error ? e.message : String(e));
}
const notes = await cleanup().catch((e) => [`pembersihan gagal: ${e.message}`]);
console.log(results.join('\n'));
console.log(`\nPembersihan: ${notes.join('; ')}`);
console.log(`\n${results.length - failed}/${results.length} lulus`);
process.exit(failed ? 1 : 0);
