'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { getSupabasePublicEnv, SUPABASE_NOT_CONFIGURED } from '@/lib/supabase/env';
import { clientIp, consumeRateLimit } from '@/lib/rate-limit';
import { getPublicSettings } from '@/lib/data/settings';
import { safeRedirectPath } from '@/lib/auth/redirect';
import { defaultHomeFor, type RoleSubject } from '@/lib/auth/roles';
import {
  ForgotPasswordSchema,
  LoginSchema,
  RegisterSchema,
  UpdatePasswordSchema,
  type ActionResult,
} from '@/lib/validations/auth';

const TOO_MANY = 'Terlalu banyak cubaan. Sila cuba semula sebentar lagi.';

function appUrl(): string {
  // Fixed, configured origin (never the request Host header) for e-mail links.
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
}

export async function signInAction(raw: unknown, next?: string | null): Promise<ActionResult> {
  if (!getSupabasePublicEnv()) return { ok: false, message: SUPABASE_NOT_CONFIGURED };
  const parsed = LoginSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const { email, password } = parsed.data;
  const ip = clientIp();
  if (!(await consumeRateLimit('login', `ip:${ip}`)) || !(await consumeRateLimit('login', `email:${email}`))) {
    return { ok: false, message: TOO_MANY };
  }

  const supabase = createServerSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (error?.code === 'email_not_confirmed' || /not confirmed/i.test(error?.message ?? '')) {
      return { ok: false, message: 'Emel anda belum disahkan. Sila semak peti masuk emel anda.' };
    }
    // Generic message: never reveal whether the e-mail exists.
    return { ok: false, message: 'Emel atau kata laluan tidak sah.' };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', data.user.id)
    .single();

  if (profile && !profile.is_active) {
    await supabase.auth.signOut();
    return { ok: false, message: 'Akaun anda telah digantung. Sila hubungi pentadbir MySanad.' };
  }

  revalidatePath('/', 'layout');
  redirect(safeRedirectPath(next, defaultHomeFor(profile as RoleSubject | null)));
}

export async function signUpAction(raw: unknown): Promise<ActionResult> {
  if (!getSupabasePublicEnv()) return { ok: false, message: SUPABASE_NOT_CONFIGURED };
  const parsed = RegisterSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  if (!(await consumeRateLimit('register', `ip:${clientIp()}`))) return { ok: false, message: TOO_MANY };
  if (!(await getPublicSettings()).registration_open) {
    return { ok: false, message: 'Pendaftaran akaun baharu ditutup buat sementara waktu.' };
  }

  const { email, password, full_name } = parsed.data;
  const supabase = createServerSupabase();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Only full_name is passed; the database trigger always assigns registered_teacher.
      data: { full_name },
      emailRedirectTo: `${appUrl()}/auth/callback?next=/teacher/dashboard`,
    },
  });

  if (error) {
    if (/password/i.test(error.message)) {
      return { ok: false, fieldErrors: { password: ['Kata laluan tidak memenuhi syarat keselamatan.'] } };
    }
    console.error('[auth] signUp', error.message);
    return { ok: false, message: 'Pendaftaran tidak dapat diproses buat masa ini. Sila cuba lagi.' };
  }

  // Same response whether or not the e-mail already exists (prevents account enumeration).
  return {
    ok: true,
    message: 'Pendaftaran diterima. Sila semak emel anda dan klik pautan pengesahan untuk mengaktifkan akaun.',
  };
}

export async function requestPasswordResetAction(raw: unknown): Promise<ActionResult> {
  if (!getSupabasePublicEnv()) return { ok: false, message: SUPABASE_NOT_CONFIGURED };
  const parsed = ForgotPasswordSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const { email } = parsed.data;
  if (
    !(await consumeRateLimit('passwordReset', `ip:${clientIp()}`)) ||
    !(await consumeRateLimit('passwordReset', `email:${email}`))
  ) {
    return { ok: false, message: TOO_MANY };
  }

  const supabase = createServerSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl()}/auth/callback?next=/auth/update-password`,
  });
  if (error) console.error('[auth] resetPasswordForEmail', error.message);

  return {
    ok: true,
    message: 'Jika emel ini berdaftar, pautan untuk menetapkan semula kata laluan telah dihantar.',
  };
}

export async function updatePasswordAction(raw: unknown): Promise<ActionResult> {
  if (!getSupabasePublicEnv()) return { ok: false, message: SUPABASE_NOT_CONFIGURED };
  const parsed = UpdatePasswordSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: 'Sesi tamat. Sila minta pautan tetapan semula yang baharu.' };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return { ok: false, message: 'Kata laluan tidak dapat dikemas kini. Sila guna kata laluan yang berbeza.' };
  }
  return { ok: true, message: 'Kata laluan berjaya dikemas kini.' };
}

export async function signOutAction(): Promise<void> {
  if (getSupabasePublicEnv()) {
    const supabase = createServerSupabase();
    await supabase.auth.signOut();
  }
  revalidatePath('/', 'layout');
  redirect('/');
}
