import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth/session';
import type { VerificationStatus } from '@/types/mysanad';

export interface MyDocument {
  id: string;
  category: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  review_status: VerificationStatus;
  review_notes: string | null;
  uploaded_at: string;
  sanad_chain: { id: string; title: string } | null;
  ijazah: { id: string; ijazah_title: string } | null;
}

/** The signed-in teacher's documents (RLS: owner only). Never includes storage paths. */
export async function getMyDocuments(): Promise<MyDocument[] | null> {
  const profile = await getSessionProfile();
  if (!profile) return null;
  const supabase = createServerSupabase();
  const { data: teacher } = await supabase.from('teachers').select('id').eq('profile_id', profile.id).maybeSingle();
  if (!teacher) return [];
  const { data, error } = await supabase
    .from('documents')
    .select(
      'id, category, original_filename, mime_type, file_size_bytes, review_status, review_notes, uploaded_at, sanad_chains(id, title), ijazah_records(id, ijazah_title)',
    )
    .eq('teacher_id', teacher.id)
    .order('uploaded_at', { ascending: false });
  if (error) throw new Error(`[documents] ${error.message}`);
  return (data ?? []).map((d) => {
    const row = d as unknown as Omit<MyDocument, 'sanad_chain' | 'ijazah'> & {
      sanad_chains: { id: string; title: string } | null;
      ijazah_records: { id: string; ijazah_title: string } | null;
    };
    const { sanad_chains, ijazah_records, ...rest } = row;
    return { ...rest, sanad_chain: sanad_chains, ijazah: ijazah_records };
  });
}
