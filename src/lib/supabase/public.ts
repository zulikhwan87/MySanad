import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getSupabasePublicEnv } from './env';

/**
 * Anonymous, cookie-less client for PUBLIC reads. Even when an administrator is signed in,
 * public pages are rendered with exactly what an anonymous visitor may see.
 * Returns null when Supabase is not configured.
 */
export function createPublicSupabase() {
  const env = getSupabasePublicEnv();
  if (!env) return null;
  return createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
