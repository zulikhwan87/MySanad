import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PortalHeader } from '@/components/teacher/portal-header';
import { NeedsTeacher } from '@/components/teacher/needs-teacher';
import { EditModeNotice } from '@/components/teacher/edit-mode-notice';
import { TeachingForm } from '@/components/teacher/forms/teaching-form';
import { NotConfigured } from '@/components/public/states';
import { getMyTeacherContext, getTeacherReferenceData } from '@/lib/data/teacher';
import { profileEditMode } from '@/lib/teacher/status';

export const metadata: Metadata = { title: 'Institusi Pengajaran' };

export default async function TeacherInstitutionsPage() {
  const [ctx, reference] = await Promise.all([getMyTeacherContext(), getTeacherReferenceData()]);
  if (!ctx || !reference) return <NotConfigured />;
  const { teacher } = ctx;
  if (!teacher) {
    return (
      <>
        <PortalHeader title="Institusi Pengajaran" />
        <NeedsTeacher />
      </>
    );
  }
  const mode = profileEditMode(teacher.profile_verification_status);
  const institution = reference.institutions.find((i) => i.id === teacher.primary_institution_id);
  const state = reference.states.find((s) => s.id === teacher.teaching_state_id);

  return (
    <>
      <PortalHeader title="Institusi Pengajaran" description="Institusi dan lokasi tempat anda mengajar sekarang." />
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Institusi semasa</CardTitle>
        </CardHeader>
        <CardContent>
          {institution ? (
            <div className="flex items-start gap-3">
              <Building2 className="mt-0.5 size-5 text-emerald-600" aria-hidden />
              <div>
                <p className="font-medium text-forest-900">{institution.name}</p>
                <p className="text-sm text-muted-foreground">
                  {institution.category}
                  {state ? ` · ${state.name}` : ''}
                </p>
                <Badge variant={institution.is_verified ? 'secondary' : 'outline'} className="mt-2">
                  {institution.is_verified ? 'Institusi disahkan' : 'Belum disahkan pentadbir'}
                </Badge>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Tiada institusi dipilih.</p>
          )}
        </CardContent>
      </Card>
      {mode === 'editable' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Kemas kini</CardTitle>
          </CardHeader>
          <CardContent>
            <TeachingForm teacher={teacher} reference={reference} acceptingStudents={ctx.settings.accepting_students} submitLabel="Simpan" />
          </CardContent>
        </Card>
      ) : (
        <>
          <EditModeNotice mode={mode} />
          {mode === 'change-request' ? (
            <Button asChild variant="outline" className="w-fit">
              <Link href="/teacher/profile#permohonan">Mohon perubahan institusi</Link>
            </Button>
          ) : null}
        </>
      )}
    </>
  );
}
