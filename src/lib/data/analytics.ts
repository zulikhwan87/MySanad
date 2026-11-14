import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';

export interface AnalyticsData {
  generated_at: string;
  months: Array<{ month: string; registered: number; published: number; approved: number; revision: number; rejected: number }>;
  teachers_by_status: Record<string, number>;
  published_by_state: Array<{ state: string; slug: string; count: number }>;
  chains_by_riwayat: Array<{ riwayat: string; count: number }>;
  documents_by_status: Record<string, number>;
  turnaround_hours: Array<{ type: string; decided: number; median: number; p90: number }>;
  top_institutions: Array<{ name: string; count: number }>;
  demo_teachers: number;
}

/** Real records only (admin_analytics enforces administrator access). */
export async function getAnalytics(): Promise<AnalyticsData> {
  const { data, error } = await createServerSupabase().rpc('admin_analytics');
  if (error) throw new Error(`[analytics] ${error.message}`);
  return data as AnalyticsData;
}
