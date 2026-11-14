import 'server-only';
import { redirect } from 'next/navigation';
import { unstable_noStore as noStore } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { getSupabasePublicEnv } from '@/lib/supabase/env';
import { canAccessAdminPortal, canAccessTeacherPortal, isSuperAdmin } from './roles';
import type { UserRole } from '@/types/mysanad';

export interface SessionProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
}

/**
 * The signed-in user's profile, or null. Uses auth.getUser() (validated with Supabase Auth),
 * never the unverified session cookie alone.
 */
export async function getSessionProfile(): Promise<SessionProfile | null> {
  // Session-dependent output must never be prerendered, even when env vars are absent at build time.
  noStore();
  if (!getSupabasePublicEnv()) return null;
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, is_active')
    .eq('id', user.id)
    .single();

  return (profile as SessionProfile | null) ?? null;
}

export async function requireTeacherPortal(next: string): Promise<SessionProfile> {
  const profile = await getSessionProfile();
  if (!profile) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!canAccessTeacherPortal(profile)) redirect('/login?error=akaun-digantung');
  return profile;
}

export async function requireAdminPortal(next: string): Promise<SessionProfile> {
  const profile = await getSessionProfile();
  if (!profile) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!canAccessAdminPortal(profile)) redirect('/');
  return profile;
}

export async function requireSuperAdmin(next: string): Promise<SessionProfile> {
  const profile = await requireAdminPortal(next);
  if (!isSuperAdmin(profile)) redirect('/admin/dashboard');
  return profile;
}
