import 'server-only';
import { cache } from 'react';
import { createServerSupabase } from '@/lib/supabase/server';
import { createPublicSupabase } from '@/lib/supabase/public';
import { getSessionProfile, type SessionProfile } from '@/lib/auth/session';
import { isAdmin } from '@/lib/auth/roles';
import { decryptPii, maskIc } from '@/lib/crypto/pii';
import {
  DEFAULT_SETTINGS,
  type ChangeRequestRecord,
  type EducationRecord,
  type IjazahRecord,
  type SubmissionRecord,
  type TeacherRecord,
  type TeacherReferenceData,
  type TeacherSettings,
} from '@/types/teacher';

export class TeacherDataError extends Error {
  constructor(context: string, cause: { message: string }) {
    super(`[${context}] ${cause.message}`);
    this.name = 'TeacherDataError';
  }
}

const TEACHER_COLUMNS = [
  'id', 'teacher_code', 'full_name_rumi', 'full_name_arabic', 'public_display_name', 'alternative_spellings',
  'professional_title', 'gender', 'ic_number_encrypted', 'private_phone', 'residential_address',
  'residential_state_id', 'residential_district_id', 'teaching_state_id', 'teaching_district_id',
  'primary_institution_id', 'photo_url', 'short_bio', 'full_biography', 'teaching_experience_years',
  'specializations', 'primary_qiraat_id', 'primary_riwayat_id', 'profile_verification_status', 'managed_by_admin', 'profile_id',
  'documents_reviewed_badge', 'sanad_reviewed_badge', 'is_published', 'published_at', 'onboarding_step',
].join(', ');

export interface TeacherContext {
  profile: SessionProfile;
  teacher: TeacherRecord | null;
  settings: TeacherSettings;
  education: EducationRecord[];
  ijazah: IjazahRecord[];
  submissions: SubmissionRecord[];
  changeRequests: ChangeRequestRecord[];
}

/**
 * Everything the signed-in teacher owns. Reads go through the user's session, so RLS
 * guarantees only their own rows are returned. The IC number is decrypted only to mask it.
 */
export const getMyTeacherContext = cache(async (teacherId?: string): Promise<TeacherContext | null> => {
  const profile = await getSessionProfile();
  if (!profile) return null;
  // Administrators may load any teacher by ID (RLS admin read policies).
  if (teacherId !== undefined && !isAdmin(profile)) return null;
  const supabase = createServerSupabase();

  const select = supabase.from('teachers').select(TEACHER_COLUMNS);
  const { data: row, error } = await (teacherId !== undefined ? select.eq('id', teacherId) : select.eq('profile_id', profile.id)).maybeSingle();
  if (error) throw new TeacherDataError('teacher', error);

  if (!row) {
    return { profile, teacher: null, settings: DEFAULT_SETTINGS, education: [], ijazah: [], submissions: [], changeRequests: [] };
  }

  const { ic_number_encrypted: encryptedIc, ...rest } = row as unknown as Record<string, unknown> & { ic_number_encrypted: string | null };
  const teacher = {
    ...(rest as Omit<TeacherRecord, 'ic_masked' | 'has_ic'>),
    ic_masked: maskIc(decryptPii(encryptedIc)),
    has_ic: Boolean(encryptedIc),
  } as TeacherRecord;

  const [settings, education, ijazah, submissions, changes] = await Promise.all([
    supabase.from('teacher_public_settings').select('*').eq('teacher_id', teacher.id).maybeSingle(),
    supabase
      .from('teacher_education')
      .select('id, institution_name, country, qualification_level, field_of_study, start_year, graduation_year, is_public, verification_status')
      .eq('teacher_id', teacher.id)
      .order('graduation_year', { ascending: false, nullsFirst: true }),
    supabase
      .from('ijazah_records')
      .select('id, ijazah_title, granting_sheikh_rumi, granting_sheikh_arabic, granting_institution, qiraat_id, riwayat_id, tariq_id, conferral_date, conferral_place, show_date_publicly, verification_status')
      .eq('teacher_id', teacher.id)
      .order('conferral_date', { ascending: false, nullsFirst: true }),
    supabase
      .from('verification_submissions')
      .select('id, submission_code, target_type, status, applicant_notes, decision_summary, submitted_at, decided_at')
      .eq('teacher_id', teacher.id)
      .order('submitted_at', { ascending: false }),
    supabase
      .from('teacher_change_requests')
      .select('id, proposed_changes, applicant_notes, status, decision_summary, created_at, decided_at')
      .eq('teacher_id', teacher.id)
      .order('created_at', { ascending: false }),
  ]);
  for (const [name, res] of [['settings', settings], ['education', education], ['ijazah', ijazah], ['submissions', submissions], ['changes', changes]] as const) {
    if (res.error) throw new TeacherDataError(name, res.error);
  }

  const s = settings.data as Partial<TeacherSettings> | null;
  return {
    profile,
    teacher,
    settings: s ? { ...DEFAULT_SETTINGS, ...pickSettings(s) } : DEFAULT_SETTINGS,
    education: (education.data ?? []) as EducationRecord[],
    ijazah: (ijazah.data ?? []) as IjazahRecord[],
    submissions: (submissions.data ?? []) as SubmissionRecord[],
    changeRequests: (changes.data ?? []) as ChangeRequestRecord[],
  };
});

function pickSettings(s: Partial<TeacherSettings>): Partial<TeacherSettings> {
  const out: Partial<TeacherSettings> = {};
  for (const k of Object.keys(DEFAULT_SETTINGS) as Array<keyof TeacherSettings>) {
    if (typeof s[k] === 'boolean') out[k] = s[k];
  }
  return out;
}

export const getTeacherReferenceData = cache(async (): Promise<TeacherReferenceData | null> => {
  const supabase = createPublicSupabase();
  if (!supabase) return null;
  const [states, districts, qiraat, riwayat, tariq, institutions] = await Promise.all([
    supabase.from('malaysian_states').select('id, name, slug').order('display_order'),
    supabase.from('malaysian_districts').select('id, state_id, name').eq('is_active', true).order('name'),
    supabase.from('qiraat_types').select('id, title_rumi').order('display_order'),
    supabase.from('riwayat_types').select('id, qiraat_id, full_label_rumi').order('display_order'),
    supabase.from('tariq_types').select('id, name_rumi').order('name_rumi'),
    supabase.from('institutions').select('id, name, state_id, is_verified, category').eq('is_archived', false).order('name'),
  ]);
  for (const res of [states, districts, qiraat, riwayat, tariq, institutions]) {
    if (res.error) throw new TeacherDataError('reference', res.error);
  }
  return {
    states: states.data ?? [],
    districts: districts.data ?? [],
    qiraat: (qiraat.data ?? []).map((q) => ({ id: q.id, label: q.title_rumi })),
    riwayat: (riwayat.data ?? []).map((r) => ({ id: r.id, label: r.full_label_rumi, qiraat_id: r.qiraat_id })),
    tariq: (tariq.data ?? []).map((t) => ({ id: t.id, label: t.name_rumi })),
    institutions: institutions.data ?? [],
  };
});
