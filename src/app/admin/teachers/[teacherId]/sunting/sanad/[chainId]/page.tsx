import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PortalHeader } from '@/components/teacher/portal-header';
import { SanadEditor } from '@/components/sanad/editor/sanad-editor';
import { ChainStatusPanel } from '@/components/sanad/editor/chain-status-panel';
import { ChainDetailsForm } from '@/components/sanad/editor/chain-details-form';
import { NotConfigured } from '@/components/public/states';
import { getMySanadChain } from '@/lib/data/sanad';
import { getTeacherReferenceData } from '@/lib/data/teacher';
import { UuidSchema } from '@/lib/validations/search';

export const metadata: Metadata = { title: 'Editor Sanad (Pentadbir)' };

export default async function AdminSanadEditorPage({ params }: { params: { teacherId: string; chainId: string } }) {
  if (!UuidSchema.safeParse(params.teacherId).success || !UuidSchema.safeParse(params.chainId).success) notFound();
  const base = `/admin/teachers/${params.teacherId}/sunting`;
  const [detail, reference] = await Promise.all([getMySanadChain(params.chainId, params.teacherId), getTeacherReferenceData()]);
  if (detail === 'not-found') notFound();
  if (!detail || !reference) return <NotConfigured />;
  const { chain } = detail;
  const editable = chain.verification_status === 'draft' || chain.verification_status === 'revision_required';

  return (
    <>
      <Link href={`${base}?bahagian=sanad`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-forest-900">
        <ArrowLeft className="size-4" aria-hidden /> Sanad guru
      </Link>
      <PortalHeader title={chain.title} description={`${chain.sanad_code}${chain.generation_depth ? ` · ${chain.generation_depth} peringkat` : ''}`} />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Status & penghantaran</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ChainStatusPanel
            chainId={chain.id}
            status={chain.verification_status}
            feedback={detail.feedback}
            revisions={detail.revisions}
            supersedes={chain.supersedes_chain_id}
            basePath={`${base}/sanad`}
          />
          <Button asChild variant="outline" size="sm">
            <Link href={`${base}?bahagian=dokumen&sanad=${chain.id}`}>
              <FileUp aria-hidden /> Muat naik dokumen sokongan untuk rantaian ini
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Graf rantaian</CardTitle>
          <CardDescription>
            {editable
              ? 'Klik perawi untuk menambah guru di atasnya, membetulkan nama, menggantikan atau membuangnya. Klik garis hubungan untuk menyunting kaedah pengambilan.'
              : 'Rantaian dikunci. Untuk membuat pembetulan, klik "Betulkan sanad" (atau "Tarik balik" jika belum disemak) di atas.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SanadEditor chainId={chain.id} graph={detail.graph} editable={editable} title={chain.title} />
        </CardContent>
      </Card>

      {editable ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Maklumat rantaian</CardTitle>
          </CardHeader>
          <CardContent>
            <ChainDetailsForm
              chainId={chain.id}
              reference={reference}
              initial={{
                title: chain.title,
                qiraat_id: chain.qiraat_id,
                riwayat_id: chain.riwayat_id,
                tariq_id: chain.tariq_id ?? '',
                transmission_method: chain.transmission_method,
                ijazah_date: chain.ijazah_date ?? '',
                ijazah_location: chain.ijazah_location ?? '',
                public_notes: chain.public_notes ?? '',
                allow_public_graph_export: chain.allow_public_graph_export,
              }}
            />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
