'use server';

import { revalidatePath } from 'next/cache';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth/session';
import { isAdmin } from '@/lib/auth/roles';
import { consumeRateLimit } from '@/lib/rate-limit';
import { encryptPii, isPiiEncryptionConfigured } from '@/lib/crypto/pii';
import { detectImageKind, isValidPhotoPath, PHOTO_MAX_BYTES } from '@/lib/files/image-signature';
import { profileEditMode } from '@/lib/teacher/status';
import type { ActionResult } from '@/lib/validations/auth';
import type { VerificationStatus } from '@/types/mysanad';
import {
  ChangeRequestSchema,
  EducationSchema,
  IdSchema,
  IjazahSchema,
  PersonalStepSchema,
  PrivateContactSchema,
  QualificationsStepSchema,
  TeachingStepSchema,
  VisibilityStepSchema,
  diffForChangeRequest,
} from '@/lib/validations/teacher';

type Result = ActionResult & { id?: string };

interface TeacherRow {
  id: string;
  profile_verification_status: VerificationStatus;
  onboarding_step: number;
  photo_url: string | null;
}

interface Ctx {
  supabase: SupabaseClient;
  userId: string;
  teacher: TeacherRow | null;
  /** True when an administrator is editing another teacher's data (teacherId given). */
  admin: boolean;
}

const NOT_ALLOWED = 'Anda tidak mempunyai kebenaran untuk tindakan ini.';

/**
 * Without teacherId: the signed-in teacher's own record.
 * With teacherId: an administrator acting for that teacher (any status; RLS admin policies apply).
 */
async function context(teacherId?: string): Promise<Ctx | Result> {
  const profile = await getSessionProfile();
  if (!profile) return { ok: false, message: 'Sesi tamat. Sila log masuk semula.' };
  if (!profile.is_active) return { ok: false, message: 'Akaun anda tidak aktif.' };
  const admin = teacherId !== undefined;
  if (admin && (!isAdmin(profile) || !IdSchema.safeParse(teacherId).success)) return { ok: false, message: NOT_ALLOWED };
  if (!(await consumeRateLimit(admin ? 'adminWrite' : 'teacherWrite', `user:${profile.id}`))) {
    return { ok: false, message: 'Terlalu banyak permintaan. Sila tunggu sebentar.' };
  }
  const supabase = createServerSupabase();
  const query = supabase.from('teachers').select('id, profile_verification_status, onboarding_step, photo_url');
  const { data, error } = await (admin ? query.eq('id', teacherId!) : query.eq('profile_id', profile.id)).maybeSingle();
  if (error) return dbError(error);
  if (admin && !data) return { ok: false, message: 'Guru tidak ditemui.' };
  return { supabase, userId: profile.id, teacher: (data as TeacherRow | null) ?? null, admin };
}

function isCtx(v: Ctx | Result): v is Ctx {
  return 'supabase' in v;
}

/** Database errors -> safe Malay messages. Our own RAISE messages are already user-facing. */
function dbError(error: PostgrestError | { code?: string; message: string }): Result {
  const code = 'code' in error ? error.code : undefined;
  if (/row-level security/i.test(error.message)) return { ok: false, message: NOT_ALLOWED };
  if (code === '42501' || code === '22023' || code === 'P0002') return { ok: false, message: error.message };
  if (code === '23505') return { ok: false, message: 'Rekod yang sama sudah wujud.' };
  if (code === '23514' || code === '23502') return { ok: false, message: 'Data tidak memenuhi syarat yang ditetapkan.' };
  if (code === '23503') return { ok: false, message: 'Rujukan yang dipilih tidak sah.' };
  console.error('[teacher-actions]', code, error.message);
  return { ok: false, message: 'Ralat pangkalan data. Sila cuba lagi.' };
}

function fieldErrors(error: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }): Result {
  return { ok: false, message: 'Sila semak medan yang bertanda.', fieldErrors: error.flatten().fieldErrors };
}

function refresh(c?: Ctx) {
  revalidatePath('/teacher', 'layout');
  if (c?.admin && c.teacher) {
    revalidatePath('/admin', 'layout');
    revalidatePath(`/directory/${c.teacher.id}`);
  }
}

async function districtBelongs(supabase: SupabaseClient, districtId: string | undefined, stateId: string | undefined) {
  if (!districtId) return true;
  if (!stateId) return false;
  const { data } = await supabase.from('malaysian_districts').select('id').eq('id', districtId).eq('state_id', stateId).maybeSingle();
  return Boolean(data);
}

async function riwayatBelongs(supabase: SupabaseClient, riwayatId: string | undefined, qiraatId: string | undefined) {
  if (!riwayatId) return true;
  if (!qiraatId) return false;
  const { data } = await supabase.from('riwayat_types').select('id').eq('id', riwayatId).eq('qiraat_id', qiraatId).maybeSingle();
  return Boolean(data);
}

async function institutionExists(supabase: SupabaseClient, id: string | undefined) {
  if (!id) return true;
  const { data } = await supabase.from('institutions').select('id').eq('id', id).eq('is_archived', false).maybeSingle();
  return Boolean(data);
}

function requireEditable(teacher: TeacherRow | null, admin = false): Result | null {
  if (!teacher) return { ok: false, message: 'Lengkapkan maklumat peribadi (langkah 2) dahulu.' };
  if (admin) return null;
  const mode = profileEditMode(teacher.profile_verification_status);
  if (mode === 'change-request') return { ok: false, message: 'Profil anda telah diterbitkan. Gunakan permohonan perubahan.' };
  if (mode === 'locked') return { ok: false, message: 'Profil anda sedang disemak atau telah dimuktamadkan.' };
  return null;
}

const nextStep = (current: number, target: number) => Math.min(7, Math.max(current, target));

// ---------------------------------------------------------------------------
// Wizard steps
// ---------------------------------------------------------------------------

export async function savePersonalStepAction(raw: unknown, teacherId?: string): Promise<Result> {
  const c = await context(teacherId);
  if (!isCtx(c)) return c;
  const parsed = PersonalStepSchema.safeParse(raw);
  if (!parsed.success) return fieldErrors(parsed.error);
  const v = parsed.data;

  if (c.teacher) {
    const blocked = requireEditable(c.teacher, c.admin);
    if (blocked) return blocked;
  }
  if (v.ic_number && !isPiiEncryptionConfigured()) {
    return { ok: false, fieldErrors: { ic_number: ['Penyimpanan No. MyKad belum diaktifkan oleh pentadbir. Kosongkan medan ini buat masa ini.'] } };
  }
  if (!(await districtBelongs(c.supabase, v.residential_district_id, v.residential_state_id))) {
    return { ok: false, fieldErrors: { residential_district_id: ['Daerah tidak sepadan dengan negeri.'] } };
  }

  const payload: Record<string, unknown> = {
    full_name_rumi: v.full_name_rumi,
    full_name_arabic: v.full_name_arabic ?? null,
    public_display_name: v.public_display_name,
    professional_title: v.professional_title ?? null,
    gender: v.gender ?? null,
    alternative_spellings: v.alternative_spellings,
    private_phone: v.private_phone ?? null,
    residential_state_id: v.residential_state_id ?? null,
    residential_district_id: v.residential_district_id ?? null,
    residential_address: v.residential_address ?? null,
  };
  if (v.ic_number) payload.ic_number_encrypted = encryptPii(v.ic_number);

  const res = c.teacher
    ? await c.supabase
        .from('teachers')
        .update({ ...payload, onboarding_step: nextStep(c.teacher.onboarding_step, 3) })
        .eq('id', c.teacher.id)
        .select('id')
        .single()
    : await c.supabase
        .from('teachers')
        .insert({ ...payload, profile_id: c.userId, onboarding_step: 3 })
        .select('id')
        .single();
  if (res.error) return dbError(res.error);
  refresh(c);
  return { ok: true, message: 'Maklumat peribadi disimpan.', id: res.data.id };
}

/** Moves the wizard forward after steps that save rows individually (education). */
export async function advanceOnboardingAction(step: number): Promise<Result> {
  const c = await context();
  if (!isCtx(c)) return c;
  if (!c.teacher) return { ok: false, message: 'Lengkapkan langkah 2 dahulu.' };
  if (!Number.isInteger(step) || step < 3 || step > 7 || step > c.teacher.onboarding_step + 1) {
    return { ok: false, message: 'Langkah tidak sah.' };
  }
  const { error } = await c.supabase
    .from('teachers')
    .update({ onboarding_step: nextStep(c.teacher.onboarding_step, step) })
    .eq('id', c.teacher.id);
  if (error) return dbError(error);
  refresh(c);
  return { ok: true };
}

export async function saveQualificationsStepAction(raw: unknown, teacherId?: string): Promise<Result> {
  const c = await context(teacherId);
  if (!isCtx(c)) return c;
  const blocked = requireEditable(c.teacher, c.admin);
  if (blocked) return blocked;
  const parsed = QualificationsStepSchema.safeParse(raw);
  if (!parsed.success) return fieldErrors(parsed.error);
  const v = parsed.data;
  if (!(await riwayatBelongs(c.supabase, v.primary_riwayat_id, v.primary_qiraat_id))) {
    return { ok: false, fieldErrors: { primary_riwayat_id: ['Riwayat tidak sepadan dengan qiraat.'] } };
  }
  const { error } = await c.supabase
    .from('teachers')
    .update({
      primary_qiraat_id: v.primary_qiraat_id,
      primary_riwayat_id: v.primary_riwayat_id ?? null,
      specializations: v.specializations,
      onboarding_step: nextStep(c.teacher!.onboarding_step, 5),
    })
    .eq('id', c.teacher!.id);
  if (error) return dbError(error);
  refresh(c);
  return { ok: true, message: 'Kelayakan disimpan.' };
}

async function resolveInstitution(
  c: Ctx,
  v: { primary_institution_id?: string; new_institution_name?: string; new_institution_category?: string; teaching_state_id: string },
): Promise<{ id: string | null } | Result> {
  if (v.new_institution_name) {
    const insert = await c.supabase
      .from('institutions')
      .insert({ name: v.new_institution_name, category: v.new_institution_category, state_id: v.teaching_state_id })
      .select('id')
      .single();
    if (!insert.error) return { id: insert.data.id };
    if (insert.error.code !== '23505') return dbError(insert.error);
    // Already proposed: reuse the existing record.
    const existing = await c.supabase
      .from('institutions')
      .select('id')
      .eq('state_id', v.teaching_state_id)
      .ilike('name', v.new_institution_name.replace(/[\\%_]/g, (m) => `\\${m}`))
      .maybeSingle();
    if (existing.data) return { id: existing.data.id };
    return { ok: false, fieldErrors: { new_institution_name: ['Institusi ini sudah wujud. Pilih daripada senarai.'] } };
  }
  if (!(await institutionExists(c.supabase, v.primary_institution_id))) {
    return { ok: false, fieldErrors: { primary_institution_id: ['Institusi tidak sah.'] } };
  }
  return { id: v.primary_institution_id ?? null };
}

export async function saveTeachingStepAction(raw: unknown, teacherId?: string): Promise<Result> {
  const c = await context(teacherId);
  if (!isCtx(c)) return c;
  const blocked = requireEditable(c.teacher, c.admin);
  if (blocked) return blocked;
  const parsed = TeachingStepSchema.safeParse(raw);
  if (!parsed.success) return fieldErrors(parsed.error);
  const v = parsed.data;
  if (!(await districtBelongs(c.supabase, v.teaching_district_id, v.teaching_state_id))) {
    return { ok: false, fieldErrors: { teaching_district_id: ['Daerah tidak sepadan dengan negeri.'] } };
  }
  const institution = await resolveInstitution(c, v);
  if ('ok' in institution) return institution;

  const { error } = await c.supabase
    .from('teachers')
    .update({
      teaching_state_id: v.teaching_state_id,
      teaching_district_id: v.teaching_district_id ?? null,
      primary_institution_id: institution.id,
      teaching_experience_years: v.teaching_experience_years,
      short_bio: v.short_bio,
      full_biography: v.full_biography ?? null,
      onboarding_step: nextStep(c.teacher!.onboarding_step, 6),
    })
    .eq('id', c.teacher!.id);
  if (error) return dbError(error);

  const settings = await c.supabase
    .from('teacher_public_settings')
    .upsert({ teacher_id: c.teacher!.id, accepting_students: v.accepting_students }, { onConflict: 'teacher_id' });
  if (settings.error) return dbError(settings.error);
  refresh(c);
  return { ok: true, message: 'Maklumat pengajaran disimpan.' };
}

/** Visibility applies immediately at any status: teachers can always hide information. */
export async function saveVisibilityAction(raw: unknown, teacherId?: string): Promise<Result> {
  const c = await context(teacherId);
  if (!isCtx(c)) return c;
  if (!c.teacher) return { ok: false, message: 'Lengkapkan langkah 2 dahulu.' };
  const parsed = VisibilityStepSchema.safeParse(raw);
  if (!parsed.success) return fieldErrors(parsed.error);
  const { error } = await c.supabase
    .from('teacher_public_settings')
    .upsert({ teacher_id: c.teacher.id, ...parsed.data }, { onConflict: 'teacher_id' });
  if (error) return dbError(error);
  if (!c.admin && c.teacher.onboarding_step < 7 && profileEditMode(c.teacher.profile_verification_status) === 'editable') {
    await c.supabase.from('teachers').update({ onboarding_step: 7 }).eq('id', c.teacher.id);
  }
  refresh(c);
  revalidatePath(`/directory/${c.teacher.id}`);
  return { ok: true, message: 'Tetapan keterlihatan disimpan dan berkuat kuasa serta-merta.' };
}

export async function submitProfileAction(notes: unknown, teacherId?: string): Promise<Result> {
  const c = await context(teacherId);
  if (!isCtx(c)) return c;
  const text = typeof notes === 'string' ? notes.slice(0, 1000) : null;
  const { data, error } = await c.supabase.rpc('submit_my_teacher_profile', { p_notes: text, ...(c.admin ? { p_teacher_id: c.teacher!.id } : {}) });
  if (error) return dbError(error);
  refresh(c);
  revalidatePath('/admin', 'layout');
  return {
    ok: true,
    message: c.admin ? 'Profil dihantar ke Barisan Semakan. Buka permohonan untuk menerbitkannya.' : 'Profil dihantar untuk pengesahan.',
    id: data as string,
  };
}

export async function withdrawSubmissionAction(): Promise<Result> {
  const c = await context();
  if (!isCtx(c)) return c;
  const { error } = await c.supabase.rpc('withdraw_my_teacher_submission');
  if (error) return dbError(error);
  refresh(c);
  return { ok: true, message: 'Penghantaran ditarik balik. Profil kembali sebagai draf.' };
}

// ---------------------------------------------------------------------------
// Education & ijazah
// ---------------------------------------------------------------------------

export async function saveEducationAction(id: string | null, raw: unknown, teacherId?: string): Promise<Result> {
  const c = await context(teacherId);
  if (!isCtx(c)) return c;
  if (!c.teacher) return { ok: false, message: 'Lengkapkan langkah 2 dahulu.' };
  if (id !== null && !IdSchema.safeParse(id).success) return { ok: false, message: 'Rekod tidak sah.' };
  const parsed = EducationSchema.safeParse(raw);
  if (!parsed.success) return fieldErrors(parsed.error);
  const v = parsed.data;
  const row = {
    institution_name: v.institution_name,
    country: v.country,
    qualification_level: v.qualification_level,
    field_of_study: v.field_of_study,
    start_year: v.start_year ?? null,
    graduation_year: v.graduation_year ?? null,
    is_public: v.is_public,
  };
  const res = id
    ? await c.supabase.from('teacher_education').update(row).eq('id', id).eq('teacher_id', c.teacher.id).select('id').maybeSingle()
    : await c.supabase.from('teacher_education').insert({ ...row, teacher_id: c.teacher.id }).select('id').single();
  if (res.error) return dbError(res.error);
  if (!res.data) return { ok: false, message: 'Rekod tidak ditemui.' };
  refresh(c);
  return { ok: true, message: 'Rekod pendidikan disimpan.', id: res.data.id };
}

export async function deleteEducationAction(id: string, teacherId?: string): Promise<Result> {
  const c = await context(teacherId);
  if (!isCtx(c)) return c;
  if (!c.teacher || !IdSchema.safeParse(id).success) return { ok: false, message: 'Rekod tidak sah.' };
  const { error, count } = await c.supabase
    .from('teacher_education')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('teacher_id', c.teacher.id);
  if (error) return dbError(error);
  if (!count) return { ok: false, message: 'Rekod tidak ditemui.' };
  refresh(c);
  return { ok: true, message: 'Rekod pendidikan dipadam.' };
}

export async function saveIjazahAction(id: string | null, raw: unknown, teacherId?: string): Promise<Result> {
  const c = await context(teacherId);
  if (!isCtx(c)) return c;
  if (!c.teacher) return { ok: false, message: 'Lengkapkan langkah 2 dahulu.' };
  if (id !== null && !IdSchema.safeParse(id).success) return { ok: false, message: 'Rekod tidak sah.' };
  const parsed = IjazahSchema.safeParse(raw);
  if (!parsed.success) return fieldErrors(parsed.error);
  const v = parsed.data;
  if (!(await riwayatBelongs(c.supabase, v.riwayat_id, v.qiraat_id))) {
    return { ok: false, fieldErrors: { riwayat_id: ['Riwayat tidak sepadan dengan qiraat.'] } };
  }
  const row = {
    ijazah_title: v.ijazah_title,
    granting_sheikh_rumi: v.granting_sheikh_rumi,
    granting_sheikh_arabic: v.granting_sheikh_arabic ?? null,
    granting_institution: v.granting_institution ?? null,
    qiraat_id: v.qiraat_id ?? null,
    riwayat_id: v.riwayat_id ?? null,
    tariq_id: v.tariq_id ?? null,
    conferral_date: v.conferral_date ?? null,
    conferral_place: v.conferral_place ?? null,
    show_date_publicly: v.show_date_publicly,
  };
  const res = id
    ? await c.supabase.from('ijazah_records').update(row).eq('id', id).eq('teacher_id', c.teacher.id).select('id').maybeSingle()
    : await c.supabase.from('ijazah_records').insert({ ...row, teacher_id: c.teacher.id }).select('id').single();
  if (res.error) return dbError(res.error);
  if (!res.data) return { ok: false, message: 'Rekod tidak ditemui.' };
  refresh(c);
  return { ok: true, message: 'Rekod ijazah disimpan.', id: res.data.id };
}

export async function deleteIjazahAction(id: string, teacherId?: string): Promise<Result> {
  const c = await context(teacherId);
  if (!isCtx(c)) return c;
  if (!c.teacher || !IdSchema.safeParse(id).success) return { ok: false, message: 'Rekod tidak sah.' };
  const { error, count } = await c.supabase.from('ijazah_records').delete({ count: 'exact' }).eq('id', id).eq('teacher_id', c.teacher.id);
  if (error) return dbError(error);
  if (!count) return { ok: false, message: 'Rekod tidak ditemui.' };
  refresh(c);
  return { ok: true, message: 'Rekod ijazah dipadam.' };
}

// ---------------------------------------------------------------------------
// Published profiles: change requests; private contact; photo
// ---------------------------------------------------------------------------

export async function requestProfileChangeAction(raw: unknown): Promise<Result> {
  const c = await context();
  if (!isCtx(c)) return c;
  if (!c.teacher || profileEditMode(c.teacher.profile_verification_status) !== 'change-request') {
    return { ok: false, message: 'Permohonan perubahan hanya untuk profil yang telah diterbitkan.' };
  }
  const parsed = ChangeRequestSchema.safeParse(raw);
  if (!parsed.success) return fieldErrors(parsed.error);
  const { applicant_notes, ...v } = parsed.data;
  if (!(await districtBelongs(c.supabase, v.teaching_district_id, v.teaching_state_id))) {
    return { ok: false, fieldErrors: { teaching_district_id: ['Daerah tidak sepadan dengan negeri.'] } };
  }
  if (!(await riwayatBelongs(c.supabase, v.primary_riwayat_id, v.primary_qiraat_id))) {
    return { ok: false, fieldErrors: { primary_riwayat_id: ['Riwayat tidak sepadan dengan qiraat.'] } };
  }
  if (!(await institutionExists(c.supabase, v.primary_institution_id))) {
    return { ok: false, fieldErrors: { primary_institution_id: ['Institusi tidak sah.'] } };
  }

  const { data: current, error: readError } = await c.supabase.from('teachers').select('*').eq('id', c.teacher.id).single();
  if (readError) return dbError(readError);
  const proposed = {
    ...v,
    full_name_arabic: v.full_name_arabic ?? null,
    professional_title: v.professional_title ?? null,
    gender: v.gender ?? null,
    primary_riwayat_id: v.primary_riwayat_id ?? null,
    teaching_district_id: v.teaching_district_id ?? null,
    primary_institution_id: v.primary_institution_id ?? null,
    full_biography: v.full_biography ?? null,
  };
  const changes = diffForChangeRequest(current as Record<string, unknown>, proposed);
  if (Object.keys(changes).length === 0) return { ok: false, message: 'Tiada perubahan untuk dihantar.' };

  const { data, error } = await c.supabase
    .from('teacher_change_requests')
    .insert({ teacher_id: c.teacher.id, proposed_changes: changes, applicant_notes: applicant_notes ?? null, submitted_by: c.userId })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') return { ok: false, message: 'Anda sudah mempunyai permohonan perubahan yang belum diputuskan.' };
    return dbError(error);
  }
  refresh(c);
  return { ok: true, message: 'Permohonan perubahan dihantar. Profil awam kekal seperti sedia ada sehingga diluluskan.', id: data.id };
}

export async function cancelChangeRequestAction(id: string): Promise<Result> {
  const c = await context();
  if (!isCtx(c)) return c;
  if (!c.teacher || !IdSchema.safeParse(id).success) return { ok: false, message: 'Rekod tidak sah.' };
  const { error, count } = await c.supabase
    .from('teacher_change_requests')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('teacher_id', c.teacher.id)
    .eq('status', 'submitted');
  if (error) return dbError(error);
  if (!count) return { ok: false, message: 'Permohonan tidak boleh dibatalkan.' };
  refresh(c);
  return { ok: true, message: 'Permohonan perubahan dibatalkan.' };
}

/** Private, unreviewed contact details: editable at any status. */
export async function savePrivateContactAction(raw: unknown, teacherId?: string): Promise<Result> {
  const c = await context(teacherId);
  if (!isCtx(c)) return c;
  if (!c.teacher) return { ok: false, message: 'Lengkapkan langkah 2 dahulu.' };
  const parsed = PrivateContactSchema.safeParse(raw);
  if (!parsed.success) return fieldErrors(parsed.error);
  const v = parsed.data;
  if (!(await districtBelongs(c.supabase, v.residential_district_id, v.residential_state_id))) {
    return { ok: false, fieldErrors: { residential_district_id: ['Daerah tidak sepadan dengan negeri.'] } };
  }
  const { error } = await c.supabase
    .from('teachers')
    .update({
      private_phone: v.private_phone ?? null,
      residential_state_id: v.residential_state_id ?? null,
      residential_district_id: v.residential_district_id ?? null,
      residential_address: v.residential_address ?? null,
    })
    .eq('id', c.teacher.id);
  if (error) return dbError(error);
  refresh(c);
  return { ok: true, message: 'Maklumat hubungan peribadi disimpan.' };
}

function photoPathFromUrl(url: string | null, userId: string): string | null {
  if (!url) return null;
  const marker = '/storage/v1/object/public/teacher-photos/';
  const i = url.indexOf(marker);
  if (i < 0) return null;
  const path = decodeURIComponent(url.slice(i + marker.length));
  return isValidPhotoPath(path, userId) ? path : null;
}

/**
 * Called after the browser uploaded a photo to teacher-photos/<uid>/... (storage RLS allows
 * only the owner folder). Verifies the file really is an image before using it.
 */
export async function setProfilePhotoAction(path: string, teacherId?: string): Promise<Result> {
  const c = await context(teacherId);
  if (!isCtx(c)) return c;
  if (!c.teacher) return { ok: false, message: 'Lengkapkan langkah 2 dahulu.' };
  if (typeof path !== 'string' || !isValidPhotoPath(path, c.userId)) return { ok: false, message: 'Laluan fail tidak sah.' };

  const bucket = c.supabase.storage.from('teacher-photos');
  const { data: file, error: downloadError } = await bucket.download(path);
  if (downloadError || !file) return { ok: false, message: 'Fail tidak ditemui. Sila muat naik semula.' };
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (file.size > PHOTO_MAX_BYTES || !detectImageKind(head)) {
    await bucket.remove([path]);
    return { ok: false, message: 'Fail bukan imej JPEG, PNG atau WebP yang sah (maksimum 2 MB).' };
  }
  const publicUrl = bucket.getPublicUrl(path).data.publicUrl;

  const mode = c.admin ? 'editable' : profileEditMode(c.teacher.profile_verification_status);
  if (mode === 'locked') {
    await bucket.remove([path]);
    return { ok: false, message: 'Profil anda sedang disemak. Foto tidak boleh ditukar buat masa ini.' };
  }
  if (mode === 'change-request') {
    const { error } = await c.supabase
      .from('teacher_change_requests')
      .insert({ teacher_id: c.teacher.id, proposed_changes: { photo_url: publicUrl }, submitted_by: c.userId });
    if (error) {
      await bucket.remove([path]);
      if (error.code === '23505') return { ok: false, message: 'Anda sudah mempunyai permohonan perubahan yang belum diputuskan.' };
      return dbError(error);
    }
    refresh(c);
    return { ok: true, message: 'Foto baharu dihantar untuk semakan.' };
  }

  const { error } = await c.supabase.from('teachers').update({ photo_url: publicUrl }).eq('id', c.teacher.id);
  if (error) {
    await bucket.remove([path]);
    return dbError(error);
  }
  const oldPath = photoPathFromUrl(c.teacher.photo_url, c.userId);
  if (oldPath && oldPath !== path) await bucket.remove([oldPath]);
  refresh(c);
  return { ok: true, message: 'Foto profil dikemas kini.' };
}

export async function removeProfilePhotoAction(teacherId?: string): Promise<Result> {
  const c = await context(teacherId);
  if (!isCtx(c)) return c;
  const blocked = requireEditable(c.teacher, c.admin);
  if (blocked) return blocked;
  const { error } = await c.supabase.from('teachers').update({ photo_url: null }).eq('id', c.teacher!.id);
  if (error) return dbError(error);
  const oldPath = photoPathFromUrl(c.teacher!.photo_url, c.userId);
  if (oldPath) await c.supabase.storage.from('teacher-photos').remove([oldPath]);
  refresh(c);
  return { ok: true, message: 'Foto profil dibuang.' };
}

/** Administrator creates a teacher profile that has no login account (e.g. elderly teachers). */
export async function createManagedTeacherAction(raw: unknown): Promise<Result> {
  const profile = await getSessionProfile();
  if (!profile?.is_active || !isAdmin(profile)) return { ok: false, message: NOT_ALLOWED };
  if (!(await consumeRateLimit('adminWrite', `user:${profile.id}`))) {
    return { ok: false, message: 'Terlalu banyak permintaan. Sila tunggu sebentar.' };
  }
  const parsed = PersonalStepSchema.safeParse(raw);
  if (!parsed.success) return fieldErrors(parsed.error);
  const v = parsed.data;
  if (v.ic_number && !isPiiEncryptionConfigured()) {
    return { ok: false, fieldErrors: { ic_number: ['Penyimpanan No. MyKad belum diaktifkan. Kosongkan medan ini buat masa ini.'] } };
  }
  const supabase = createServerSupabase();
  if (!(await districtBelongs(supabase, v.residential_district_id, v.residential_state_id))) {
    return { ok: false, fieldErrors: { residential_district_id: ['Daerah tidak sepadan dengan negeri.'] } };
  }
  const { data, error } = await supabase
    .from('teachers')
    .insert({
      profile_id: null,
      managed_by_admin: true,
      full_name_rumi: v.full_name_rumi,
      full_name_arabic: v.full_name_arabic ?? null,
      public_display_name: v.public_display_name,
      professional_title: v.professional_title ?? null,
      gender: v.gender ?? null,
      alternative_spellings: v.alternative_spellings,
      private_phone: v.private_phone ?? null,
      residential_state_id: v.residential_state_id ?? null,
      residential_district_id: v.residential_district_id ?? null,
      residential_address: v.residential_address ?? null,
      ic_number_encrypted: v.ic_number ? encryptPii(v.ic_number) : null,
      onboarding_step: 7,
    })
    .select('id')
    .single();
  if (error) return dbError(error);
  revalidatePath('/admin', 'layout');
  return { ok: true, message: 'Profil guru dicipta. Teruskan dengan maklumat seterusnya.', id: data.id as string };
}

/** Administrator attaches a managed profile to an account the teacher (or family) registered. */
export async function linkTeacherAccountAction(teacherId: string, email: string): Promise<Result> {
  const c = await context(teacherId);
  if (!isCtx(c)) return c;
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return { ok: false, fieldErrors: { email: ['Emel tidak sah.'] } };
  }
  const { error } = await c.supabase.rpc('admin_link_teacher_account', { p_teacher_id: teacherId, p_email: email.trim() });
  if (error) return dbError(error);
  refresh(c);
  return { ok: true, message: 'Profil dipautkan. Pemilik akaun kini boleh mengurusnya melalui portal guru.' };
}
