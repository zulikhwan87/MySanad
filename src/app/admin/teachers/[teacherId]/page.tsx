import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PortalHeader } from '@/components/teacher/portal-header';
import { TeacherReview } from '@/components/admin/teacher-review';
import { PublicationControls } from '@/components/admin/publication-controls';
import { getTeacherForReview } from '@/lib/data/admin';
import { UuidSchema } from '@/lib/validations/search';

export const metadata: Metadata = { title: 'Butiran Guru' };

export default async function AdminTeacherPage({ params }: { params: { teacherId: string } }) {
  if (!UuidSchema.safeParse(params.teacherId).success) notFound();
  const bundle = await getTeacherForReview(params.teacherId);
  if (!bundle) notFound();
  const t = bundle.teacher;
  return (
    <>
      <Link href="/admin/teachers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-forest-900">
        <ArrowLeft className="size-4" aria-hidden /> Pengurusan Guru
      </Link>
      <PortalHeader
        title={t.public_display_name}
        description={t.teacher_code}
        actions={
          t.is_published ? (
            <Link href={`/directory/${t.id}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              Profil awam <ExternalLink className="size-3.5" aria-hidden />
            </Link>
          ) : null
        }
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Penerbitan</CardTitle>
        </CardHeader>
        <CardContent>
          <PublicationControls teacherId={t.id} status={t.profile_verification_status} isPublished={t.is_published} isFeatured={t.is_featured} />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6">
          <TeacherReview bundle={bundle} itemActions />
        </CardContent>
      </Card>
    </>
  );
}
