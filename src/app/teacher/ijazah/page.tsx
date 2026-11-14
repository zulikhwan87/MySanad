import type { Metadata } from 'next';
import { Card, CardContent } from '@/components/ui/card';
import { PortalHeader } from '@/components/teacher/portal-header';
import { NeedsTeacher } from '@/components/teacher/needs-teacher';
import { IjazahManager } from '@/components/teacher/forms/ijazah-manager';
import { NotConfigured } from '@/components/public/states';
import { getMyTeacherContext, getTeacherReferenceData } from '@/lib/data/teacher';

export const metadata: Metadata = { title: 'Rekod Ijazah' };

export default async function TeacherIjazahPage() {
  const [ctx, reference] = await Promise.all([getMyTeacherContext(), getTeacherReferenceData()]);
  if (!ctx || !reference) return <NotConfigured />;
  return (
    <>
      <PortalHeader
        title="Rekod Ijazah"
        description="Ijazah yang anda terima. Gunakan ikon muat naik pada setiap rekod untuk menghantar sijil sebagai dokumen sokongan."
      />
      {ctx.teacher ? (
        <Card>
          <CardContent className="pt-6">
            <IjazahManager items={ctx.ijazah} reference={reference} />
          </CardContent>
        </Card>
      ) : (
        <NeedsTeacher />
      )}
    </>
  );
}
