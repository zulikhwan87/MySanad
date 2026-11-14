import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth/auth-shell';
import { UpdatePasswordForm } from '@/components/auth/update-password-form';
import { requireTeacherPortal } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Tetapkan Kata Laluan Baharu' };

export default async function UpdatePasswordPage() {
  await requireTeacherPortal('/auth/update-password');
  return (
    <AuthShell title="Tetapkan Kata Laluan Baharu" description="Pilih kata laluan baharu untuk akaun anda.">
      <UpdatePasswordForm />
    </AuthShell>
  );
}
