import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { PortalHeader } from '@/components/teacher/portal-header';
import { NewChainForm } from '@/components/sanad/editor/new-chain-form';
import { NotConfigured } from '@/components/public/states';
import { getMyTeacherContext, getTeacherReferenceData } from '@/lib/data/teacher';
import { UuidSchema } from '@/lib/validations/search';

export const metadata: Metadata = { title: 'Rantaian Sanad Baharu (Pentadbir)' };

export default async function AdminNewChainPage({ params }: { params: { teacherId: string } }) {
  if (!UuidSchema.safeParse(params.teacherId).success) notFound();
  const [ctx, reference] = await Promise.all([getMyTeacherContext(params.teacherId), getTeacherReferenceData()]);
  if (!ctx || !reference) return <NotConfigured />;
  if (!ctx.teacher) notFound();
  const base = `/admin/teachers/${params.teacherId}/sunting`;
  return (
    <>
      <Link href={`${base}?bahagian=sanad`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-forest-900">
        <ArrowLeft className="size-4" aria-hidden /> Sanad guru
      </Link>
      <PortalHeader
        title={`Rantaian sanad baharu: ${ctx.teacher.public_display_name}`}
        description="Mulakan dengan guru (syeikh) yang memberi ijazah kepada guru ini. Rantaian dicipta sebagai draf; bina ke atas dalam editor graf."
      />
      <Card>
        <CardContent className="pt-6">
          <NewChainForm reference={reference} teacherId={params.teacherId} chainHref={`${base}/sanad`} />
        </CardContent>
      </Card>
    </>
  );
}
