import type { VerificationStatus } from '@/types/mysanad';

export type ProfileEditMode = 'editable' | 'change-request' | 'locked';

/** Mirrors the database lock in guard_teachers_protected_columns (migration 007). */
export function profileEditMode(status: VerificationStatus | null | undefined): ProfileEditMode {
  if (!status || status === 'draft' || status === 'submitted' || status === 'revision_required') return 'editable';
  if (status === 'approved' || status === 'published') return 'change-request';
  return 'locked';
}

export const STATUS_LABELS: Record<VerificationStatus, string> = {
  draft: 'Draf',
  submitted: 'Dihantar',
  under_review: 'Dalam semakan',
  revision_required: 'Perlu pembetulan',
  approved: 'Diluluskan',
  published: 'Diterbitkan',
  rejected: 'Ditolak',
  suspended: 'Digantung',
};

export const STATUS_TONE: Record<VerificationStatus, 'secondary' | 'gold' | 'warning' | 'destructive' | 'outline'> = {
  draft: 'outline',
  submitted: 'secondary',
  under_review: 'secondary',
  revision_required: 'warning',
  approved: 'gold',
  published: 'gold',
  rejected: 'destructive',
  suspended: 'destructive',
};

export const WIZARD_STEPS = [
  { step: 1, title: 'Akaun', description: 'Akaun dan emel disahkan' },
  { step: 2, title: 'Maklumat peribadi', description: 'Nama, gelaran dan maklumat pengesahan' },
  { step: 3, title: 'Pendidikan', description: 'Rekod pendidikan akademik' },
  { step: 4, title: 'Kelayakan al-Quran', description: 'Qiraat, riwayat dan ijazah' },
  { step: 5, title: 'Maklumat pengajaran', description: 'Lokasi, institusi dan biografi' },
  { step: 6, title: 'Keterlihatan awam', description: 'Apa yang dipaparkan kepada umum' },
  { step: 7, title: 'Semak & hantar', description: 'Semak semula dan hantar untuk pengesahan' },
] as const;

/** Requested step, limited to 2..maxReached (a teacher cannot skip ahead). */
export function clampStep(raw: unknown, maxReached: number): number {
  const ceiling = Math.max(2, Math.min(maxReached, 7));
  const n = Number(raw);
  if (raw === undefined || raw === null || raw === '' || !Number.isInteger(n)) return ceiling;
  return Math.max(2, Math.min(n, ceiling));
}

export interface CompletionInput {
  hasTeacher: boolean;
  fullName?: string | null;
  displayName?: string | null;
  teachingStateId?: string | null;
  primaryQiraatId?: string | null;
  shortBio?: string | null;
}

/** Same rules as submit_my_teacher_profile(); shows what is missing before submitting. */
export function missingForSubmission(t: CompletionInput): string[] {
  if (!t.hasTeacher) return ['profil guru'];
  const missing: string[] = [];
  if (!t.fullName?.trim()) missing.push('nama penuh');
  if (!t.displayName?.trim()) missing.push('nama paparan');
  if (!t.teachingStateId) missing.push('negeri mengajar');
  if (!t.primaryQiraatId) missing.push('qiraat utama');
  if ((t.shortBio ?? '').length < 30) missing.push('biografi ringkas');
  return missing;
}
