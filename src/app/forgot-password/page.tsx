import type { Metadata } from 'next';
import { AuthLink, AuthShell } from '@/components/auth/auth-shell';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';
import { getT } from '@/lib/i18n/server';

export const metadata: Metadata = { title: 'Lupa Kata Laluan' };

export default function ForgotPasswordPage() {
  const t = getT();
  return (
    <AuthShell
      title={t.auth.forgotTitle}
      description={t.auth.forgotDesc}
      footer={<AuthLink href="/login">{t.auth.backToLogin}</AuthLink>}
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
