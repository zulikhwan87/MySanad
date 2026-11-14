import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthLink, AuthShell } from '@/components/auth/auth-shell';
import { LoginForm } from '@/components/auth/login-form';
import { Alert } from '@/components/ui/alert';
import { getSessionProfile } from '@/lib/auth/session';
import { defaultHomeFor } from '@/lib/auth/roles';
import { safeRedirectPath } from '@/lib/auth/redirect';
import { getT } from '@/lib/i18n/server';

export const metadata: Metadata = { title: 'Log Masuk' };

export default async function LoginPage({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  const profile = await getSessionProfile();
  if (profile?.is_active) redirect(safeRedirectPath(searchParams.next, defaultHomeFor(profile)));

  const t = getT();
  const errors: Record<string, string> = { 'pautan-tidak-sah': t.auth.linkInvalid, 'akaun-digantung': t.auth.accountInactive };
  const error = searchParams.error ? errors[searchParams.error] : undefined;
  return (
    <AuthShell
      title={t.auth.loginTitle}
      description={t.auth.loginDesc}
      footer={
        <>
          {t.auth.noAccount} <AuthLink href="/register">{t.auth.registerLink}</AuthLink>
        </>
      }
    >
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <LoginForm next={searchParams.next} />
      <p className="text-right text-sm">
        <AuthLink href="/forgot-password">{t.auth.forgot}</AuthLink>
      </p>
    </AuthShell>
  );
}
