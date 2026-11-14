import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthLink, AuthShell } from '@/components/auth/auth-shell';
import { RegisterForm } from '@/components/auth/register-form';
import { getSessionProfile } from '@/lib/auth/session';
import { getPublicSettings } from '@/lib/data/settings';
import { getT } from '@/lib/i18n/server';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = { title: 'Daftar Akaun Guru' };

export default async function RegisterPage() {
  const profile = await getSessionProfile();
  if (profile?.is_active) redirect('/teacher/dashboard');
  const { registration_open: open } = await getPublicSettings();
  const t = getT();

  return (
    <AuthShell
      title={t.auth.registerTitle}
      description={t.auth.registerDesc}
      footer={
        <>
          {t.auth.haveAccount} <AuthLink href="/login">{t.auth.loginLink}</AuthLink>
        </>
      }
    >
      {open ? <RegisterForm /> : <Alert variant="info">{t.auth.registrationClosed}</Alert>}
    </AuthShell>
  );
}
