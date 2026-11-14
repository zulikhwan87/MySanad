import type { Metadata } from 'next';
import { Card, CardContent } from '@/components/ui/card';
import { PortalHeader } from '@/components/teacher/portal-header';
import { NeedsTeacher } from '@/components/teacher/needs-teacher';
import { EducationManager } from '@/components/teacher/forms/education-manager';
import { NotConfigured } from '@/components/public/states';
import { getMyTeacherContext } from '@/lib/data/teacher';

export const metadata: Metadata = { title: 'Pendidikan' };

export default async function TeacherEducationPage() {
  const ctx = await getMyTeacherContext();
  if (!ctx) return <NotConfigured />;
  return (
    <>
      <PortalHeader
        title="Pendidikan"
        description="Rekod baharu atau yang disunting akan disemak oleh pentadbir sebelum dipaparkan kepada umum."
      />
      {ctx.teacher ? (
        <Card>
          <CardContent className="pt-6">
            <EducationManager items={ctx.education} />
          </CardContent>
        </Card>
      ) : (
        <NeedsTeacher />
      )}
    </>
  );
}
