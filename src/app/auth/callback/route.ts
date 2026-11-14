import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';
import { getSupabasePublicEnv } from '@/lib/supabase/env';
import { safeRedirectPath } from '@/lib/auth/redirect';

const OTP_TYPES: readonly EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'];

/** Handles e-mail confirmation and password-recovery links (PKCE code or token_hash). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeRedirectPath(searchParams.get('next'));
  const failure = NextResponse.redirect(new URL('/login?error=pautan-tidak-sah', origin));

  if (!getSupabasePublicEnv()) return failure;
  const supabase = createServerSupabase();

  const code = searchParams.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return error ? failure : NextResponse.redirect(new URL(next, origin));
  }

  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    return error ? failure : NextResponse.redirect(new URL(next, origin));
  }

  return failure;
}
