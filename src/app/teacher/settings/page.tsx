import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PortalHeader } from '@/components/teacher/portal-header';
import { NeedsTeacher } from '@/components/teacher/needs-teacher';
import { VisibilityForm } from '@/components/teacher/forms/visibility-form';
import { NotConfigured } from '@/components/public/states';
import { getMyTeacherContext } from '@/lib/data/teacher';
import { ROLE_LABELS } from '@/lib/auth/roles';

export const metadata: Metadata = { title: 'Tetapan' };

export default async function TeacherSettingsPage() {
  const ctx = await getMyTeacherContext();
  if (!ctx) return <NotConfigured />;
  return (
    <>
      <PortalHeader title="Tetapan" />
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Keterlihatan awam</CardTitle>
          <CardDescription>Tentukan maklumat yang dipaparkan dalam profil awam anda.</CardDescription>
        </CardHeader>
        <CardContent>{ctx.teacher ? <VisibilityForm settings={ctx.settings} /> : <NeedsTeacher />}</CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Akaun</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Emel</dt>
              <dd className="font-medium">{ctx.profile.email}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Peranan</dt>
              <dd className="font-medium">{ROLE_LABELS[ctx.profile.role]}</dd>
            </div>
          </dl>
          <Button asChild variant="outline">
            <Link href="/auth/update-password">Tukar kata laluan</Link>
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
