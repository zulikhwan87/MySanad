import 'server-only';
import { cache } from 'react';
import { createPublicSupabase } from '@/lib/supabase/public';
import { PAGE_SIZE, escapeLike, pageCount, type DirectoryParams } from '@/lib/validations/search';
import type {
  DistrictStat,
  Paginated,
  PlatformStats,
  PublicInstitution,
  PublicSanadDocument,
  QiraatStat,
  PublicTeacherProfileData,
  RecentTeacher,
  ReferenceOption,
  StateStat,
  TeacherSearchResult,
} from '@/types/public';

/** Thrown for unexpected database errors; rendered by the route's error boundary. */
export class PublicDataError extends Error {
  constructor(context: string, cause: { message: string }) {
    super(`[${context}] ${cause.message}`);
    this.name = 'PublicDataError';
  }
}

/** null => Supabase not configured (pages show a "not connected" state, never fake data). */
export type Maybe<T> = T | null;

function db() {
  return createPublicSupabase();
}

export const getPlatformStats = cache(async (): Promise<Maybe<PlatformStats>> => {
  const supabase = db();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('public_platform_stats');
  if (error) throw new PublicDataError('platform-stats', error);
  return data as PlatformStats;
});

export const getStateStats = cache(async (): Promise<Maybe<StateStat[]>> => {
  const supabase = db();
  if (!supabase) return null;
  const { data, error } = await supabase.from('v_public_state_stats').select('*').order('display_order');
  if (error) throw new PublicDataError('state-stats', error);
  return (data ?? []) as StateStat[];
});

export const getQiraatStats = cache(async (): Promise<Maybe<QiraatStat[]>> => {
  const supabase = db();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('public_qiraat_riwayat_stats');
  if (error) throw new PublicDataError('qiraat-stats', error);
  return (data ?? []) as QiraatStat[];
});

export async function getPublicSanadDocuments(teacherId: string): Promise<PublicSanadDocument[]> {
  const supabase = db();
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('get_public_sanad_documents', { p_teacher_id: teacherId });
  if (error) throw new PublicDataError('sanad-documents', error);
  return (data ?? []) as PublicSanadDocument[];
}

export async function getDistrictStats(stateId: string): Promise<Maybe<DistrictStat[]>> {
  const supabase = db();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('v_public_district_stats')
    .select('*')
    .eq('state_id', stateId)
    .order('name');
  if (error) throw new PublicDataError('district-stats', error);
  return (data ?? []) as DistrictStat[];
}

export interface FilterOptions {
  qiraat: ReferenceOption[];
  riwayat: ReferenceOption[];
  institutions: ReferenceOption[];
}

export async function getFilterOptions(stateSlug?: string): Promise<Maybe<FilterOptions>> {
  const supabase = db();
  if (!supabase) return null;
  let institutionsQuery = supabase.from('v_public_institutions').select('id, name').gt('teacher_count', 0).order('name');
  if (stateSlug) institutionsQuery = institutionsQuery.eq('state_slug', stateSlug);

  const [q, r, i] = await Promise.all([
    supabase.from('qiraat_types').select('id, title_rumi, title_arabic').order('display_order'),
    supabase.from('riwayat_types').select('id, qiraat_id, full_label_rumi, full_label_arabic').order('display_order'),
    institutionsQuery,
  ]);
  for (const [name, res] of [['qiraat', q], ['riwayat', r], ['institutions', i]] as const) {
    if (res.error) throw new PublicDataError(`filter-${name}`, res.error);
  }
  return {
    qiraat: (q.data ?? []).map((x) => ({ id: x.id, label: x.title_rumi, labelArabic: x.title_arabic })),
    riwayat: (r.data ?? []).map((x) => ({
      id: x.id,
      label: x.full_label_rumi,
      labelArabic: x.full_label_arabic,
      parentId: x.qiraat_id,
    })),
    institutions: (i.data ?? []).map((x) => ({ id: x.id as string, label: x.name as string })),
  };
}

export async function searchTeachers(
  params: Partial<DirectoryParams> & { stateSlug?: string },
  pageSize = PAGE_SIZE,
): Promise<Maybe<Paginated<TeacherSearchResult>>> {
  const supabase = db();
  if (!supabase) return null;
  const page = params.halaman ?? 1;
  const { data, error } = await supabase.rpc('search_public_teachers', {
    p_query: params.q ?? null,
    p_state_slug: params.stateSlug ?? params.negeri ?? null,
    p_district_id: params.daerah ?? null,
    p_qiraat_id: params.qiraat ?? null,
    p_riwayat_id: params.riwayat ?? null,
    p_institution_id: params.institusi ?? null,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  if (error) throw new PublicDataError('search', error);
  const rows = (data ?? []) as Array<TeacherSearchResult & { total_count: number | string; relevance: number }>;
  const total = rows.length ? Number(rows[0].total_count) : 0;
  return {
    items: rows.map(({ total_count: _t, relevance: _r, ...rest }) => rest),
    total,
    page,
    pageSize,
    pageCount: pageCount(total, pageSize),
  };
}

export async function getFeaturedTeachers(limit = 6): Promise<Maybe<TeacherSearchResult[]>> {
  const result = await searchTeachers({}, limit);
  return result ? result.items.filter((t) => t.is_featured) : null;
}

export async function getRecentTeachers(limit = 6): Promise<Maybe<RecentTeacher[]>> {
  const supabase = db();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('v_public_teachers')
    .select('id, public_display_name, full_name_arabic, state_name, district_name, published_at, is_demo_record')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new PublicDataError('recent-teachers', error);
  return (data ?? []) as RecentTeacher[];
}

export const getTeacherProfile = cache(async (teacherId: string): Promise<Maybe<PublicTeacherProfileData | 'not-found'>> => {
  const supabase = db();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('get_public_teacher_profile', { p_teacher_id: teacherId });
  if (error) throw new PublicDataError('teacher-profile', error);
  return (data as PublicTeacherProfileData | null) ?? 'not-found';
});

export async function getPublicInstitutions(filters: {
  q?: string;
  stateSlug?: string;
  page?: number;
}): Promise<Maybe<Paginated<PublicInstitution>>> {
  const supabase = db();
  if (!supabase) return null;
  const page = filters.page ?? 1;
  let query = supabase.from('v_public_institutions').select('*', { count: 'exact' });
  if (filters.q) query = query.ilike('name', `%${escapeLike(filters.q)}%`);
  if (filters.stateSlug) query = query.eq('state_slug', filters.stateSlug);
  const { data, count, error } = await query
    .order('teacher_count', { ascending: false })
    .order('name')
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (error) throw new PublicDataError('institutions', error);
  const total = count ?? 0;
  return { items: (data ?? []) as PublicInstitution[], total, page, pageSize: PAGE_SIZE, pageCount: pageCount(total) };
}
