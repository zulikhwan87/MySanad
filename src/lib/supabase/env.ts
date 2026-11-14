export interface SupabasePublicEnv {
  url: string;
  anonKey: string;
}

/** Returns null when Supabase is not configured (e.g. a fresh clone without .env.local). */
export function getSupabasePublicEnv(): SupabasePublicEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export const SUPABASE_NOT_CONFIGURED =
  'Supabase belum dikonfigurasi. Tetapkan NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY dalam .env.local.';
