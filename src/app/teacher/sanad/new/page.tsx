import type { Metadata } from 'next';
import { Card, CardContent } from '@/components/ui/card';
import { PortalHeader } from '@/components/teacher/portal-header';
import { NeedsTeacher } from '@/components/teacher/needs-teacher';
import { NewChainForm } from '@/components/sanad/editor/new-chain-form';
import { NotConfigured } from '@/components/public/states';
import { getMyTeacherContext, getTeacherReferenceData } from '@/lib/data/teacher';

export const metadata: Metadata = { title: 'Tambah Rantaian Sanad' };

export default async function NewSanadPage() {
  const [ctx, reference] = await Promise.all([getMyTeacherContext(), getTeacherReferenceData()]);
  if (!ctx || !reference) return <NotConfigured />;
  return (
    <>
      <PortalHeader
        title="Tambah Rantaian Sanad"
        description="Rantaian dicipta sebagai draf. Anda boleh membina rantaian ke atas dalam editor graf sebelum menghantarnya untuk semakan."
      />
      {ctx.teacher ? (
        <Card>
          <CardContent className="pt-6">
            <NewChainForm reference={reference} />
          </CardContent>
        </Card>
      ) : (
        <NeedsTeacher />
      )}
    </>
  );
}
