import type { VerificationStatus } from './mysanad';

export interface TeacherRecord {
  id: string;
  teacher_code: string;
  full_name_rumi: string;
  full_name_arabic: string | null;
  public_display_name: string;
  alternative_spellings: string[] | null;
  professional_title: string | null;
  gender: 'Lelaki' | 'Perempuan' | null;
  private_phone: string | null;
  residential_address: string | null;
  residential_state_id: string | null;
  residential_district_id: string | null;
  teaching_state_id: string | null;
  teaching_district_id: string | null;
  primary_institution_id: string | null;
  photo_url: string | null;
  short_bio: string | null;
  full_biography: string | null;
  teaching_experience_years: number | null;
  specializations: string[] | null;
  primary_qiraat_id: string | null;
  primary_riwayat_id: string | null;
  profile_verification_status: VerificationStatus;
  documents_reviewed_badge: boolean;
  sanad_reviewed_badge: boolean;
  is_published: boolean;
  published_at: string | null;
  onboarding_step: number;
  /** Masked MyKad (never the full number) and whether one is stored. */
  ic_masked: string | null;
  has_ic: boolean;
  /** Created and maintained by an administrator (no login account). */
  managed_by_admin?: boolean;
  profile_id?: string | null;
}

export interface TeacherSettings {
  show_photo: boolean;
  show_institution: boolean;
  show_education: boolean;
  show_ijazah_dates: boolean;
  show_sanad_graph: boolean;
  allow_graph_download: boolean;
  show_public_contact: boolean;
  accepting_students: boolean;
}

export const DEFAULT_SETTINGS: TeacherSettings = {
  show_photo: true,
  show_institution: true,
  show_education: true,
  show_ijazah_dates: true,
  show_sanad_graph: true,
  allow_graph_download: false,
  show_public_contact: true,
  accepting_students: true,
};

export interface EducationRecord {
  id: string;
  institution_name: string;
  country: string;
  qualification_level: string;
  field_of_study: string;
  start_year: number | null;
  graduation_year: number | null;
  is_public: boolean;
  verification_status: VerificationStatus;
}

export interface IjazahRecord {
  id: string;
  ijazah_title: string;
  granting_sheikh_rumi: string;
  granting_sheikh_arabic: string | null;
  granting_institution: string | null;
  qiraat_id: string | null;
  riwayat_id: string | null;
  tariq_id: string | null;
  conferral_date: string | null;
  conferral_place: string | null;
  show_date_publicly: boolean;
  verification_status: VerificationStatus;
}

export interface SubmissionRecord {
  id: string;
  submission_code: string;
  target_type: string;
  status: VerificationStatus;
  applicant_notes: string | null;
  decision_summary: string | null;
  submitted_at: string;
  decided_at: string | null;
}

export interface ChangeRequestRecord {
  id: string;
  proposed_changes: Record<string, unknown>;
  applicant_notes: string | null;
  status: VerificationStatus;
  decision_summary: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface TeacherReferenceData {
  states: Array<{ id: string; name: string; slug: string }>;
  districts: Array<{ id: string; state_id: string; name: string }>;
  qiraat: Array<{ id: string; label: string }>;
  riwayat: Array<{ id: string; label: string; qiraat_id: string }>;
  tariq: Array<{ id: string; label: string }>;
  institutions: Array<{ id: string; name: string; state_id: string | null; is_verified: boolean; category: string }>;
}
