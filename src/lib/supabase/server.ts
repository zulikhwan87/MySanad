import 'server-only';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { getSupabasePublicEnv, SUPABASE_NOT_CONFIGURED } from './env';

/** Supabase client bound to the visitor's session cookies. Respects RLS. */
export function createServerSupabase() {
  const env = getSupabasePublicEnv();
  if (!env) throw new Error(SUPABASE_NOT_CONFIGURED);
  const cookieStore = cookies();
  return createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component: cookies are read-only there; middleware refreshes them.
        }
      },
    },
  });
}

/**
 * Service-role client: BYPASSES RLS. Only for trusted server code after an explicit
 * authorization check (signed URLs, rate limiting). Never import from client components;
 * the `server-only` import above makes that a build error.
 */
export function createServiceRoleSupabase() {
  const env = getSupabasePublicEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env || !serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY diperlukan pada pelayan.');
  }
  return createServiceClient(env.url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function isServiceRoleConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && getSupabasePublicEnv());
}
