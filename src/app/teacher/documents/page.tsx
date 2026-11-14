import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PortalHeader } from '@/components/teacher/portal-header';
import { NeedsTeacher } from '@/components/teacher/needs-teacher';
import { DocumentUploader } from '@/components/documents/document-uploader';
import { DocumentList } from '@/components/documents/document-list';
import { NotConfigured } from '@/components/public/states';
import { getMyTeacherContext } from '@/lib/data/teacher';
import { getMySanadChains } from '@/lib/data/sanad';
import { getMyDocuments } from '@/lib/data/documents';
import { DOCUMENT_CATEGORIES } from '@/lib/validations/document';

export const metadata: Metadata = { title: 'Dokumen Sokongan' };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function TeacherDocumentsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const [ctx, chains, documents] = await Promise.all([getMyTeacherContext(), getMySanadChains(), getMyDocuments()]);
  if (!ctx || !chains || !documents) return <NotConfigured />;
  if (!ctx.teacher) {
    return (
      <>
        <PortalHeader title="Dokumen Sokongan" />
        <NeedsTeacher />
      </>
    );
  }

  const ijazah = ctx.ijazah.map((i) => ({ id: i.id, label: i.ijazah_title }));
  const chainOptions = chains.map((c) => ({ id: c.id, label: `${c.title} (${c.sanad_code})` }));
  // Prefill only with values that belong to this teacher.
  const ijazahId = ijazah.some((i) => i.id === first(searchParams.ijazah)) ? first(searchParams.ijazah) : undefined;
  const chainId = chainOptions.some((c) => c.id === first(searchParams.sanad)) ? first(searchParams.sanad) : undefined;
  const category = (DOCUMENT_CATEGORIES as readonly string[]).includes(first(searchParams.kategori) ?? '')
    ? first(searchParams.kategori)
    : ijazahId || chainId
      ? 'Sijil Ijazah Sanad'
      : undefined;

  return (
    <>
      <PortalHeader
        title="Dokumen Sokongan"
        description="Muat naik sijil ijazah dan dokumen sokongan untuk semakan pentadbir. Dokumen tidak pernah dipaparkan kepada umum."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Muat naik dokumen</CardTitle>
          <CardDescription>Setiap dokumen dihantar untuk semakan secara automatik selepas dimuat naik.</CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentUploader
            userId={ctx.profile.id}
            targets={{ ijazah, chains: chainOptions }}
            defaults={{ category, ijazahId, chainId }}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Dokumen saya ({documents.length})</CardTitle>
          <CardDescription>Pautan paparan sah selama 60 saat sahaja. Dokumen yang sedang atau telah disemak tidak boleh dipadam.</CardDescription>
        </CardHeader>
        <CardContent>
          <DocumentList
            documents={documents.map((d) => ({
              ...d,
              link: d.ijazah ? `Ijazah: ${d.ijazah.ijazah_title}` : d.sanad_chain ? `Sanad: ${d.sanad_chain.title}` : null,
            }))}
          />
        </CardContent>
      </Card>
    </>
  );
}
