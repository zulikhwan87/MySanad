import { createBrowserClient } from '@supabase/ssr';
import { getSupabasePublicEnv, SUPABASE_NOT_CONFIGURED } from './env';

export function createClient() {
  const env = getSupabasePublicEnv();
  if (!env) throw new Error(SUPABASE_NOT_CONFIGURED);
  return createBrowserClient(env.url, env.anonKey);
}
