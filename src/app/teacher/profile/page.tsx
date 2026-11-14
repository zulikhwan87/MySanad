import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PortalHeader } from '@/components/teacher/portal-header';
import { EditModeNotice } from '@/components/teacher/edit-mode-notice';
import { StatusBadge } from '@/components/teacher/status-badge';
import { NeedsTeacher } from '@/components/teacher/needs-teacher';
import { PhotoUploader } from '@/components/teacher/forms/photo-uploader';
import { PrivateContactForm } from '@/components/teacher/forms/private-contact-form';
import { ChangeRequestForm } from '@/components/teacher/forms/change-request-form';
import { ChangeRequestList } from '@/components/teacher/change-request-list';
import { NotConfigured } from '@/components/public/states';
import { getMyTeacherContext, getTeacherReferenceData } from '@/lib/data/teacher';
import { profileEditMode } from '@/lib/teacher/status';

export const metadata: Metadata = { title: 'Profil Saya' };

export default async function TeacherProfilePage() {
  const [ctx, reference] = await Promise.all([getMyTeacherContext(), getTeacherReferenceData()]);
  if (!ctx || !reference) return <NotConfigured />;
  const { teacher } = ctx;
  if (!teacher) {
    return (
      <>
        <PortalHeader title="Profil Saya" />
        <NeedsTeacher />
      </>
    );
  }
  const mode = profileEditMode(teacher.profile_verification_status);
  const openRequest = ctx.changeRequests.some((c) => c.status === 'submitted' || c.status === 'under_review');

  return (
    <>
      <PortalHeader
        title="Profil Saya"
        description={`${teacher.public_display_name} · ${teacher.teacher_code}`}
        actions={<StatusBadge status={teacher.profile_verification_status} />}
      />
      <EditModeNotice mode={mode} />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Foto profil</CardTitle>
        </CardHeader>
        <CardContent>
          <PhotoUploader
            userId={ctx.profile.id}
            name={teacher.public_display_name}
            photoUrl={teacher.photo_url}
            canRemove={mode === 'editable'}
            needsReview={mode === 'change-request'}
          />
        </CardContent>
      </Card>

      {mode === 'editable' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Maklumat profil</CardTitle>
            <CardDescription>Sunting maklumat melalui langkah pendaftaran.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild variant="outline"><Link href="/teacher/register?langkah=2">Maklumat peribadi</Link></Button>
            <Button asChild variant="outline"><Link href="/teacher/register?langkah=4">Kelayakan</Link></Button>
            <Button asChild variant="outline"><Link href="/teacher/register?langkah=5">Pengajaran & biografi</Link></Button>
          </CardContent>
        </Card>
      ) : null}

      {mode === 'change-request' ? (
        <Card id="permohonan">
          <CardHeader>
            <CardTitle className="text-lg">Permohonan perubahan maklumat awam</CardTitle>
            <CardDescription>
              Profil awam kekal seperti yang telah disahkan sehingga pentadbir meluluskan perubahan anda. Hanya medan yang berubah akan
              dihantar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {openRequest ? null : <ChangeRequestForm teacher={teacher} reference={reference} />}
            <ChangeRequestList items={ctx.changeRequests} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Hubungan peribadi (sulit)</CardTitle>
          <CardDescription>Untuk pentadbir sahaja. Boleh dikemas kini pada bila-bila masa tanpa semakan.</CardDescription>
        </CardHeader>
        <CardContent>
          <PrivateContactForm teacher={teacher} reference={reference} />
        </CardContent>
      </Card>
    </>
  );
}
