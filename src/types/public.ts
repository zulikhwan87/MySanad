import type { VerificationStatus } from './mysanad';

export interface PlatformStats {
  teachers: number;
  demo_teachers: number;
  sanad_chains: number;
  states_with_teachers: number;
  institutions: number;
}

export interface StateStat {
  id: string;
  code: string;
  name: string;
  slug: string;
  is_federal_territory: boolean;
  region: 'Semenanjung' | 'Borneo';
  display_order: number;
  teacher_count: number;
}

export interface DistrictStat {
  id: string;
  state_id: string;
  name: string;
  slug: string;
  teacher_count: number;
}

export interface TeacherSearchResult {
  id: string;
  teacher_code: string;
  public_display_name: string;
  full_name_arabic: string | null;
  professional_title: string | null;
  photo_url: string | null;
  state_name: string;
  state_slug: string;
  district_name: string | null;
  institution_id: string | null;
  institution_name: string | null;
  specializations: string[] | null;
  primary_qiraat_rumi: string | null;
  primary_riwayat_rumi: string | null;
  documents_reviewed_badge: boolean;
  sanad_reviewed_badge: boolean;
  is_featured: boolean;
  is_demo_record: boolean;
  published_at: string | null;
  approved_sanad_count: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
}

export interface RecentTeacher {
  id: string;
  public_display_name: string;
  full_name_arabic: string | null;
  state_name: string;
  district_name: string | null;
  published_at: string | null;
  is_demo_record: boolean;
}

export interface ReferenceOption {
  id: string;
  label: string;
  labelArabic?: string | null;
  parentId?: string | null;
}

export interface PublicInstitution {
  id: string;
  name: string;
  short_name: string | null;
  category: string;
  website_url: string | null;
  is_verified: boolean;
  state_name: string | null;
  state_slug: string | null;
  district_name: string | null;
  teacher_count: number;
}

export interface PublicSanadChain {
  id: string;
  sanad_code: string;
  title: string;
  qiraat: string;
  qiraat_arabic: string | null;
  riwayat: string;
  riwayat_arabic: string | null;
  tariq: string | null;
  transmission_method: string | null;
  immediate_teacher_name_rumi: string;
  immediate_teacher_name_arabic: string | null;
  ijazah_date: string | null;
  ijazah_location: string | null;
  generation_depth: number | null;
  public_notes: string | null;
  verification_status: VerificationStatus;
  verified_at: string | null;
  is_demo_record: boolean;
}

export interface PublicTeacherProfileData {
  teacher: {
    id: string;
    teacher_code: string;
    full_name_rumi: string;
    full_name_arabic: string | null;
    public_display_name: string;
    alternative_spellings: string[] | null;
    professional_title: string | null;
    state_name: string;
    state_slug: string;
    district_name: string | null;
    institution_id: string | null;
    institution_name: string | null;
    photo_url: string | null;
    short_bio: string | null;
    full_biography: string | null;
    teaching_experience_years: number | null;
    specializations: string[] | null;
    primary_qiraat_rumi: string | null;
    primary_riwayat_rumi: string | null;
    profile_verification_status: VerificationStatus;
    documents_reviewed_badge: boolean;
    sanad_reviewed_badge: boolean;
    is_featured: boolean;
    is_demo_record: boolean;
    published_at: string | null;
    /** Entered by an administrator on the teacher's behalf (no teacher account). */
    managed_by_admin?: boolean;
  };
  settings: { accepting_students: boolean; show_sanad_graph: boolean; allow_graph_download: boolean };
  institution: {
    id: string;
    name: string;
    short_name: string | null;
    category: string;
    website_url: string | null;
    is_verified: boolean;
    state_name: string | null;
    district_name: string | null;
  } | null;
  education: Array<{
    id: string;
    institution_name: string;
    country: string;
    qualification_level: string;
    field_of_study: string;
    graduation_year: number | null;
  }>;
  ijazah: Array<{
    id: string;
    ijazah_title: string;
    granting_sheikh_rumi: string;
    granting_sheikh_arabic: string | null;
    granting_institution: string | null;
    qiraat: string | null;
    riwayat: string | null;
    tariq: string | null;
    conferral_date: string | null;
    conferral_place: string | null;
  }>;
  sanad_chains: PublicSanadChain[];
  contacts: Array<{ id: string; channel_type: string; label: string; contact_value: string }>;
}

export interface RiwayatStat {
  id: string;
  code: string;
  label_rumi: string;
  label_arabic: string;
  teacher_count: number;
}

export interface QiraatStat {
  id: string;
  code: string;
  title_rumi: string;
  title_arabic: string;
  imam_name_rumi: string;
  teacher_count: number;
  riwayat: RiwayatStat[];
}

/** A sanad certificate the teacher chose to show and an administrator approved. No file name or storage path. */
export interface PublicSanadDocument {
  id: string;
  mime_type: string;
  sanad_chain_id: string | null;
  chain_title: string | null;
  reviewed_at: string | null;
}
