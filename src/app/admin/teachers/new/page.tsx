import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Info } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PortalHeader } from '@/components/teacher/portal-header';
import { PersonalForm } from '@/components/teacher/forms/personal-form';
import { NotConfigured } from '@/components/public/states';
import { getTeacherReferenceData } from '@/lib/data/teacher';
import { isPiiEncryptionConfigured } from '@/lib/crypto/pii';

export const metadata: Metadata = { title: 'Tambah Guru' };

export default async function AdminNewTeacherPage() {
  const reference = await getTeacherReferenceData();
  if (!reference) return <NotConfigured />;
  return (
    <>
      <Link href="/admin/teachers" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-forest-900">
        <ArrowLeft className="size-4" aria-hidden /> Pengurusan Guru
      </Link>
      <PortalHeader
        title="Tambah guru"
        description="Untuk guru yang tidak dapat mendaftar sendiri (contohnya warga emas). Profil diurus oleh pentadbir dan tidak memerlukan akaun atau emel."
      />
      <Alert className="flex gap-3">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Masukkan maklumat dengan kebenaran guru. Selepas langkah ini anda boleh menambah pendidikan, ijazah, maklumat pengajaran,
          gambar, dokumen dan rantaian sanad. Guru yang mempunyai emel masih boleh mendaftar sendiri; profil ini boleh dipautkan kepada
          akaunnya kemudian.
        </span>
      </Alert>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Maklumat peribadi</CardTitle>
          <CardDescription>Medan bertanda * wajib. Maklumat peribadi tidak dipaparkan kepada awam.</CardDescription>
        </CardHeader>
        <CardContent>
          <PersonalForm
            teacher={null}
            reference={reference}
            piiEnabled={isPiiEncryptionConfigured()}
            nextHref="/admin/teachers"
            adminCreate
            submitLabel="Cipta profil & teruskan"
          />
        </CardContent>
      </Card>
    </>
  );
}
