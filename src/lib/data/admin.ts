import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';
import { loadChainGraph } from '@/lib/data/sanad';
import { maskIc, decryptPii } from '@/lib/crypto/pii';
import { PAGE_SIZE, escapeLike, pageCount } from '@/lib/validations/search';
import type { VerificationStatus, UserRole } from '@/types/mysanad';
import type { Paginated } from '@/types/public';
import type { SanadGraphData } from '@/lib/sanad/graph';

/** All reads here use the administrator's own session: RLS grants admin access. */
function db() {
  return createServerSupabase();
}

function fail(context: string, error: { message: string }): never {
  throw new Error(`[admin:${context}] ${error.message}`);
}

export interface DashboardCounts {
  open_by_type: Record<string, number>;
  open_change_requests: number;
  pending_items: number;
  teachers_total: number;
  teachers_published: number;
  teachers_suspended: number;
  chains_public: number;
  unverified_institutions: number;
}

export async function getDashboardCounts(): Promise<DashboardCounts> {
  const { data, error } = await db().rpc('admin_dashboard_counts');
  if (error) fail('dashboard', error);
  return data as DashboardCounts;
}

export interface QueueItem {
  id: string;
  submission_code: string;
  target_type: string;
  target_record_id: string;
  status: VerificationStatus;
  submitted_at: string;
  decided_at: string | null;
  applicant_notes: string | null;
  teacher: { id: string; public_display_name: string; teacher_code: string } | null;
  reviewer: { full_name: string } | null;
}

export async function getReviewQueue(filters: { open: boolean; type?: string; page: number }): Promise<Paginated<QueueItem>> {
  let q = db()
    .from('verification_submissions')
    .select(
      'id, submission_code, target_type, target_record_id, status, submitted_at, decided_at, applicant_notes, teacher:teachers(id, public_display_name, teacher_code), reviewer:profiles!verification_submissions_assigned_reviewer_id_fkey(full_name)',
      { count: 'exact' },
    );
  q = filters.open ? q.in('status', ['submitted', 'under_review']) : q.not('status', 'in', '(submitted,under_review)');
  if (filters.type) q = q.eq('target_type', filters.type);
  const { data, count, error } = await q
    .order('submitted_at', { ascending: filters.open })
    .range((filters.page - 1) * PAGE_SIZE, filters.page * PAGE_SIZE - 1);
  if (error) fail('queue', error);
  const total = count ?? 0;
  return { items: (data ?? []) as unknown as QueueItem[], total, page: filters.page, pageSize: PAGE_SIZE, pageCount: pageCount(total) };
}

export interface ChangeRequestItem {
  id: string;
  status: VerificationStatus;
  proposed_changes: Record<string, unknown>;
  applicant_notes: string | null;
  decision_summary: string | null;
  created_at: string;
  teacher: { id: string; public_display_name: string; teacher_code: string } | null;
}

export async function getChangeRequests(open: boolean): Promise<ChangeRequestItem[]> {
  let q = db()
    .from('teacher_change_requests')
    .select('id, status, proposed_changes, applicant_notes, decision_summary, created_at, teacher:teachers(id, public_display_name, teacher_code)');
  q = open ? q.in('status', ['submitted', 'under_review']) : q.not('status', 'in', '(submitted,under_review)');
  const { data, error } = await q.order('created_at', { ascending: open }).limit(100);
  if (error) fail('change-requests', error);
  return (data ?? []) as unknown as ChangeRequestItem[];
}

export interface ReviewHistoryItem {
  id: string;
  previous_status: VerificationStatus;
  new_status: VerificationStatus;
  public_feedback: string | null;
  internal_admin_comment: string | null;
  checklist_verified: Record<string, boolean>;
  created_at: string;
  reviewer: { full_name: string } | null;
}

export interface AdminTeacherFull {
  id: string;
  profile_id: string;
  teacher_code: string;
  full_name_rumi: string;
  full_name_arabic: string | null;
  public_display_name: string;
  alternative_spellings: string[] | null;
  professional_title: string | null;
  gender: string | null;
  private_phone: string | null;
  residential_address: string | null;
  short_bio: string | null;
  full_biography: string | null;
  teaching_experience_years: number | null;
  specializations: string[] | null;
  photo_url: string | null;
  profile_verification_status: VerificationStatus;
  is_published: boolean;
  is_featured: boolean;
  is_demo_record: boolean;
  documents_reviewed_badge: boolean;
  sanad_reviewed_badge: boolean;
  published_at: string | null;
  created_at: string;
  ic_masked: string | null;
  has_ic: boolean;
  email: string | null;
  labels: { teaching: string | null; residential: string | null; institution: string | null; qiraat: string | null; riwayat: string | null };
}

const TEACHER_SELECT = `id, profile_id, teacher_code, full_name_rumi, full_name_arabic, public_display_name, alternative_spellings,
  professional_title, gender, ic_number_encrypted, private_phone, residential_address, short_bio, full_biography,
  teaching_experience_years, specializations, photo_url, profile_verification_status, is_published, is_featured, is_demo_record,
  documents_reviewed_badge, sanad_reviewed_badge, published_at, created_at,
  profile:profiles(email),
  teaching_state:malaysian_states!teachers_teaching_state_id_fkey(name),
  teaching_district:malaysian_districts!teachers_teaching_district_id_fkey(name),
  residential_state:malaysian_states!teachers_residential_state_id_fkey(name),
  institution:institutions(name, is_verified),
  qiraat:qiraat_types(title_rumi),
  riwayat:riwayat_types(full_label_rumi)`;

type TeacherRow = Record<string, unknown> & {
  ic_number_encrypted: string | null;
  profile: { email: string } | null;
  teaching_state: { name: string } | null;
  teaching_district: { name: string } | null;
  residential_state: { name: string } | null;
  institution: { name: string; is_verified: boolean } | null;
  qiraat: { title_rumi: string } | null;
  riwayat: { full_label_rumi: string } | null;
};

function shapeTeacher(row: TeacherRow): AdminTeacherFull {
  const { ic_number_encrypted, profile, teaching_state, teaching_district, residential_state, institution, qiraat, riwayat, ...rest } = row;
  return {
    ...(rest as unknown as Omit<AdminTeacherFull, 'ic_masked' | 'has_ic' | 'email' | 'labels'>),
    // Only a masked value is ever rendered; full reveal goes through an audited action.
    ic_masked: maskIc(decryptPii(ic_number_encrypted)),
    has_ic: Boolean(ic_number_encrypted),
    email: profile?.email ?? null,
    labels: {
      teaching: [teaching_district?.name, teaching_state?.name].filter(Boolean).join(', ') || null,
      residential: residential_state?.name ?? null,
      institution: institution ? `${institution.name}${institution.is_verified ? '' : ' (belum disahkan)'}` : null,
      qiraat: qiraat?.title_rumi ?? null,
      riwayat: riwayat?.full_label_rumi ?? null,
    },
  };
}

export interface TeacherReviewBundle {
  teacher: AdminTeacherFull;
  education: Array<{ id: string; institution_name: string; country: string; qualification_level: string; field_of_study: string; graduation_year: number | null; verification_status: VerificationStatus; is_public: boolean }>;
  ijazah: Array<{ id: string; ijazah_title: string; granting_sheikh_rumi: string; granting_institution: string | null; conferral_date: string | null; verification_status: VerificationStatus }>;
  contacts: Array<{ id: string; channel_type: string; label: string; contact_value: string; is_approved: boolean; is_public: boolean }>;
  documents: Array<{ id: string; category: string; original_filename: string; review_status: VerificationStatus; uploaded_at: string }>;
  chains: Array<{ id: string; sanad_code: string; title: string; verification_status: VerificationStatus; is_public: boolean }>;
  submissions: Array<{ id: string; submission_code: string; target_type: string; status: VerificationStatus; submitted_at: string }>;
}

export async function getTeacherForReview(teacherId: string): Promise<TeacherReviewBundle | null> {
  const s = db();
  const { data: row, error } = await s.from('teachers').select(TEACHER_SELECT).eq('id', teacherId).maybeSingle();
  if (error) fail('teacher', error);
  if (!row) return null;
  const [education, ijazah, contacts, documents, chains, submissions] = await Promise.all([
    s.from('teacher_education').select('id, institution_name, country, qualification_level, field_of_study, graduation_year, verification_status, is_public').eq('teacher_id', teacherId),
    s.from('ijazah_records').select('id, ijazah_title, granting_sheikh_rumi, granting_institution, conferral_date, verification_status').eq('teacher_id', teacherId),
    s.from('public_contact_channels').select('id, channel_type, label, contact_value, is_approved, is_public').eq('teacher_id', teacherId),
    s.from('documents').select('id, category, original_filename, review_status, uploaded_at').eq('teacher_id', teacherId).order('uploaded_at', { ascending: false }),
    s.from('sanad_chains').select('id, sanad_code, title, verification_status, is_public').eq('teacher_id', teacherId).order('created_at', { ascending: false }),
    s.from('verification_submissions').select('id, submission_code, target_type, status, submitted_at').eq('teacher_id', teacherId).order('submitted_at', { ascending: false }),
  ]);
  for (const r of [education, ijazah, contacts, documents, chains, submissions]) if (r.error) fail('teacher-bundle', r.error);
  return {
    teacher: shapeTeacher(row as unknown as TeacherRow),
    education: (education.data ?? []) as TeacherReviewBundle['education'],
    ijazah: (ijazah.data ?? []) as TeacherReviewBundle['ijazah'],
    contacts: (contacts.data ?? []) as TeacherReviewBundle['contacts'],
    documents: (documents.data ?? []) as TeacherReviewBundle['documents'],
    chains: (chains.data ?? []) as TeacherReviewBundle['chains'],
    submissions: (submissions.data ?? []) as TeacherReviewBundle['submissions'],
  };
}

export interface AdminChainBundle {
  chain: {
    id: string;
    sanad_code: string;
    title: string;
    teacher_id: string;
    verification_status: VerificationStatus;
    is_public: boolean;
    transmission_method: string;
    ijazah_date: string | null;
    ijazah_location: string | null;
    public_notes: string | null;
    internal_notes: string | null;
    generation_depth: number | null;
    supersedes_chain_id: string | null;
    qiraat: string | null;
    riwayat: string | null;
    tariq: string | null;
  };
  graph: SanadGraphData;
  documents: Array<{ id: string; category: string; original_filename: string; review_status: VerificationStatus }>;
}

export async function getChainForReview(chainId: string): Promise<AdminChainBundle | null> {
  const s = db();
  const { data, error } = await s
    .from('sanad_chains')
    .select(
      'id, sanad_code, title, teacher_id, verification_status, is_public, transmission_method, ijazah_date, ijazah_location, public_notes, internal_notes, generation_depth, supersedes_chain_id, qiraat:qiraat_types(title_rumi), riwayat:riwayat_types(full_label_rumi), tariq:tariq_types(name_rumi)',
    )
    .eq('id', chainId)
    .maybeSingle();
  if (error) fail('chain', error);
  if (!data) return null;
  const row = data as unknown as AdminChainBundle['chain'] & {
    qiraat: { title_rumi: string } | null;
    riwayat: { full_label_rumi: string } | null;
    tariq: { name_rumi: string } | null;
  };
  const [graph, docs] = await Promise.all([
    loadChainGraph(s, chainId, row.teacher_id),
    s.from('documents').select('id, category, original_filename, review_status').eq('sanad_chain_id', chainId),
  ]);
  if (docs.error) fail('chain-docs', docs.error);
  return {
    chain: { ...row, qiraat: row.qiraat?.title_rumi ?? null, riwayat: row.riwayat?.full_label_rumi ?? null, tariq: row.tariq?.name_rumi ?? null },
    graph: { chains: [{ id: row.id, title: row.title, verification_status: row.verification_status }], nodes: graph.nodes, edges: graph.edges },
    documents: (docs.data ?? []) as AdminChainBundle['documents'],
  };
}

export interface SubmissionDetail {
  submission: QueueItem;
  reviews: ReviewHistoryItem[];
  teacher: TeacherReviewBundle | null;
  document: {
    id: string;
    category: string;
    original_filename: string;
    mime_type: string;
    file_size_bytes: number;
    review_status: VerificationStatus;
    uploaded_at: string;
    show_publicly: boolean;
    ijazah: { ijazah_title: string; granting_sheikh_rumi: string } | null;
    chain: { id: string; title: string } | null;
  } | null;
  chain: AdminChainBundle | null;
}

export async function getSubmissionDetail(submissionId: string): Promise<SubmissionDetail | null> {
  const s = db();
  const { data, error } = await s
    .from('verification_submissions')
    .select(
      'id, submission_code, target_type, target_record_id, status, submitted_at, decided_at, applicant_notes, teacher:teachers(id, public_display_name, teacher_code), reviewer:profiles!verification_submissions_assigned_reviewer_id_fkey(full_name)',
    )
    .eq('id', submissionId)
    .maybeSingle();
  if (error) fail('submission', error);
  if (!data) return null;
  const submission = data as unknown as QueueItem;

  const { data: reviews, error: revError } = await s
    .from('verification_reviews')
    .select('id, previous_status, new_status, public_feedback, internal_admin_comment, checklist_verified, created_at, reviewer:profiles(full_name)')
    .eq('submission_id', submissionId)
    .order('created_at', { ascending: false });
  if (revError) fail('reviews', revError);

  const teacherId = submission.teacher?.id;
  const teacher = teacherId ? await getTeacherForReview(teacherId) : null;
  let document: SubmissionDetail['document'] = null;
  let chain: AdminChainBundle | null = null;

  if (submission.target_type === 'ijazah_document') {
    const { data: doc, error: docError } = await s
      .from('documents')
      .select('id, category, original_filename, mime_type, file_size_bytes, review_status, uploaded_at, show_publicly, ijazah:ijazah_records(ijazah_title, granting_sheikh_rumi), chain:sanad_chains(id, title)')
      .eq('id', submission.target_record_id)
      .maybeSingle();
    if (docError) fail('document', docError);
    document = (doc as unknown as SubmissionDetail['document']) ?? null;
  } else if (submission.target_type === 'sanad_chain') {
    chain = await getChainForReview(submission.target_record_id);
  }

  return { submission, reviews: (reviews ?? []) as unknown as ReviewHistoryItem[], teacher, document, chain };
}

export interface ChangeRequestDetail {
  request: ChangeRequestItem;
  rows: Array<{ field: string; current: string; proposed: string }>;
}

const FIELD_LABELS: Record<string, string> = {
  full_name_rumi: 'Nama penuh',
  full_name_arabic: 'Nama Arab',
  public_display_name: 'Nama paparan',
  alternative_spellings: 'Ejaan alternatif',
  professional_title: 'Gelaran',
  gender: 'Jantina',
  teaching_state_id: 'Negeri mengajar',
  teaching_district_id: 'Daerah mengajar',
  primary_institution_id: 'Institusi',
  photo_url: 'Foto profil',
  short_bio: 'Biografi ringkas',
  full_biography: 'Biografi penuh',
  teaching_experience_years: 'Pengalaman (tahun)',
  specializations: 'Pengkhususan',
  primary_qiraat_id: 'Qiraat utama',
  primary_riwayat_id: 'Riwayat utama',
};

const LOOKUPS: Record<string, { table: string; column: string }> = {
  teaching_state_id: { table: 'malaysian_states', column: 'name' },
  teaching_district_id: { table: 'malaysian_districts', column: 'name' },
  primary_institution_id: { table: 'institutions', column: 'name' },
  primary_qiraat_id: { table: 'qiraat_types', column: 'title_rumi' },
  primary_riwayat_id: { table: 'riwayat_types', column: 'full_label_rumi' },
};

export async function getChangeRequestDetail(requestId: string): Promise<ChangeRequestDetail | null> {
  const s = db();
  const { data, error } = await s
    .from('teacher_change_requests')
    .select('id, status, proposed_changes, applicant_notes, decision_summary, created_at, teacher_id, teacher:teachers(id, public_display_name, teacher_code)')
    .eq('id', requestId)
    .maybeSingle();
  if (error) fail('change-request', error);
  if (!data) return null;
  const request = data as unknown as ChangeRequestItem & { teacher_id: string };
  const fields = Object.keys(request.proposed_changes);
  const { data: current, error: curError } = await s.from('teachers').select(fields.join(', ')).eq('id', request.teacher_id).single();
  if (curError) fail('change-request-current', curError);

  const label = async (field: string, value: unknown): Promise<string> => {
    if (value === null || value === undefined || value === '') return '—';
    if (Array.isArray(value)) return value.join(', ') || '—';
    const lookup = LOOKUPS[field];
    if (lookup && typeof value === 'string') {
      const { data: ref } = await s.from(lookup.table).select(lookup.column).eq('id', value).maybeSingle();
      return ((ref as Record<string, string> | null)?.[lookup.column] as string | undefined) ?? value;
    }
    return String(value);
  };
  const cur = current as unknown as Record<string, unknown>;
  const rows = await Promise.all(
    fields.map(async (f) => ({ field: FIELD_LABELS[f] ?? f, current: await label(f, cur[f]), proposed: await label(f, request.proposed_changes[f]) })),
  );
  return { request, rows };
}

export interface AdminTeacherListItem {
  id: string;
  teacher_code: string;
  public_display_name: string;
  profile_verification_status: VerificationStatus;
  is_published: boolean;
  is_featured: boolean;
  is_demo_record: boolean;
  managed_by_admin: boolean;
  created_at: string;
  state: { name: string } | null;
}

export async function getAdminTeachers(f: { q?: string; status?: string; page: number }): Promise<Paginated<AdminTeacherListItem>> {
  let q = db()
    .from('teachers')
    .select('id, teacher_code, public_display_name, profile_verification_status, is_published, is_featured, is_demo_record, managed_by_admin, created_at, state:malaysian_states!teachers_teaching_state_id_fkey(name)', { count: 'exact' });
  if (f.status) q = q.eq('profile_verification_status', f.status);
  if (f.q) {
    const term = `%${escapeLike(f.q)}%`;
    q = q.or(`public_display_name.ilike.${JSON.stringify(term)},teacher_code.ilike.${JSON.stringify(term)},full_name_rumi.ilike.${JSON.stringify(term)}`);
  }
  const { data, count, error } = await q.order('created_at', { ascending: false }).range((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE - 1);
  if (error) fail('teachers', error);
  const total = count ?? 0;
  return { items: (data ?? []) as unknown as AdminTeacherListItem[], total, page: f.page, pageSize: PAGE_SIZE, pageCount: pageCount(total) };
}

export interface AdminChainListItem {
  id: string;
  sanad_code: string;
  title: string;
  verification_status: VerificationStatus;
  is_public: boolean;
  updated_at: string;
  teacher: { id: string; public_display_name: string } | null;
}

export async function getAdminChains(f: { status?: string; page: number }): Promise<Paginated<AdminChainListItem>> {
  let q = db().from('sanad_chains').select('id, sanad_code, title, verification_status, is_public, updated_at, teacher:teachers(id, public_display_name)', { count: 'exact' });
  if (f.status) q = q.eq('verification_status', f.status);
  const { data, count, error } = await q.order('updated_at', { ascending: false }).range((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE - 1);
  if (error) fail('chains', error);
  const total = count ?? 0;
  return { items: (data ?? []) as unknown as AdminChainListItem[], total, page: f.page, pageSize: PAGE_SIZE, pageCount: pageCount(total) };
}

export interface AdminInstitution {
  id: string;
  name: string;
  category: string;
  is_verified: boolean;
  is_archived: boolean;
  created_at: string;
  state: { name: string } | null;
}

export async function getAdminInstitutions(f: { filter: 'unverified' | 'verified' | 'archived'; q?: string }): Promise<AdminInstitution[]> {
  let q = db().from('institutions').select('id, name, category, is_verified, is_archived, created_at, state:malaysian_states(name)');
  if (f.filter === 'archived') q = q.eq('is_archived', true);
  else q = q.eq('is_archived', false).eq('is_verified', f.filter === 'verified');
  if (f.q) q = q.ilike('name', `%${escapeLike(f.q)}%`);
  const { data, error } = await q.order('name').limit(200);
  if (error) fail('institutions', error);
  return (data ?? []) as unknown as AdminInstitution[];
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export async function getAdminUsers(f: { q?: string; role?: string; page: number }): Promise<Paginated<AdminUser>> {
  let q = db().from('profiles').select('id, email, full_name, role, is_active, created_at', { count: 'exact' });
  if (f.role) q = q.eq('role', f.role);
  if (f.q) {
    const term = `%${escapeLike(f.q)}%`;
    q = q.or(`email.ilike.${JSON.stringify(term)},full_name.ilike.${JSON.stringify(term)}`);
  }
  const { data, count, error } = await q.order('created_at', { ascending: false }).range((f.page - 1) * PAGE_SIZE, f.page * PAGE_SIZE - 1);
  if (error) fail('users', error);
  const total = count ?? 0;
  return { items: (data ?? []) as AdminUser[], total, page: f.page, pageSize: PAGE_SIZE, pageCount: pageCount(total) };
}

export interface AuditEntry {
  id: string;
  action: string;
  entity_table: string;
  entity_id: string | null;
  actor_role: UserRole | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
  actor: { full_name: string; email: string } | null;
}

export async function getAuditLogs(f: { table?: string; action?: string; page: number }): Promise<Paginated<AuditEntry>> {
  let q = db()
    .from('audit_logs')
    .select('id, action, entity_table, entity_id, actor_role, old_values, new_values, created_at, actor:profiles(full_name, email)', { count: 'exact' });
  if (f.table) q = q.eq('entity_table', f.table);
  if (f.action) q = q.eq('action', f.action);
  const size = 25;
  const { data, count, error } = await q.order('created_at', { ascending: false }).range((f.page - 1) * size, f.page * size - 1);
  if (error) fail('audit', error);
  const total = count ?? 0;
  return { items: (data ?? []) as unknown as AuditEntry[], total, page: f.page, pageSize: size, pageCount: pageCount(total, size) };
}
