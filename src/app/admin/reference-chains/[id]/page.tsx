import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PortalHeader } from '@/components/teacher/portal-header';
import { NotConfigured } from '@/components/public/states';
import { ReferenceMetaForm, ReferenceStatusPanel } from '@/components/admin/reference-chains/reference-forms';
import { ReferenceChainEditor } from '@/components/admin/reference-chains/reference-chain-editor';
import { requireAdminPortal } from '@/lib/auth/session';
import { getReferenceChain, orderUpwards } from '@/lib/data/reference-chains';
import { getTeacherReferenceData } from '@/lib/data/teacher';
import { UuidSchema } from '@/lib/validations/search';

export const metadata: Metadata = { title: 'Rantaian Rujukan' };

export default async function ReferenceChainPage({ params }: { params: { id: string } }) {
  await requireAdminPortal(`/admin/reference-chains/${params.id}`);
  if (!UuidSchema.safeParse(params.id).success) notFound();
  const [rc, reference] = await Promise.all([getReferenceChain(params.id), getTeacherReferenceData()]);
  if (!rc) notFound();
  if (!reference) return <NotConfigured />;
  const editable = rc.status !== 'active';
  const depth = orderUpwards(
    rc.root_node_id,
    rc.graph.edges.map((e) => ({ source_node_id: e.source, target_node_id: e.target })),
  );
  const names = new Map(rc.graph.nodes.map((n) => [n.id, n]));
  const ordered = Array.from(depth.entries()).sort((a, b) => a[1] - b[1]);
  const disconnected = rc.graph.nodes.filter((n) => !depth.has(n.id));

  return (
    <>
      <Link href="/admin/reference-chains" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-forest-900">
        <ArrowLeft className="size-4" aria-hidden /> Rantaian Rujukan
      </Link>
      <PortalHeader title={rc.title} description={[rc.qiraat, rc.riwayat, rc.tariq].filter(Boolean).join(' · ') || undefined} />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Status</CardTitle>
        </CardHeader>
        <CardContent>
          <ReferenceStatusPanel id={rc.id} status={rc.status} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Senarai semakan perawi</CardTitle>
          <CardDescription>Dari perawi permulaan ke atas. Semak setiap nama dengan sumber rujukan anda.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-1 text-sm">
            {ordered.map(([id, d], i) => {
              const n = names.get(id);
              return (
                <li key={id} className="flex flex-wrap items-baseline gap-x-3 rounded-lg px-2 py-1 odd:bg-secondary/40">
                  <span className="w-6 shrink-0 text-right font-mono text-xs text-muted-foreground">{i + 1}.</span>
                  <span className="font-medium text-forest-900">{n?.full_name_rumi ?? '—'}</span>
                  {n?.full_name_arabic ? (
                    <span lang="ar" dir="rtl" className="arabic text-forest-700">
                      {n.full_name_arabic}
                    </span>
                  ) : null}
                  {d === 0 ? <span className="text-xs text-muted-foreground">(perawi permulaan)</span> : null}
                </li>
              );
            })}
          </ol>
          {disconnected.length ? (
            <p className="mt-3 text-sm font-medium text-red-700">
              {disconnected.length} perawi tidak bersambung kepada perawi permulaan: {disconnected.map((n) => n.full_name_rumi).join(', ')}.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Graf rantaian rujukan</CardTitle>
          <CardDescription>
            {editable
              ? 'Klik perawi untuk menambah gurunya, membetulkan, menggantikan atau membuangnya. Klik garis hubungan untuk memadamnya.'
              : 'Rantaian aktif dikunci. Nyahaktifkan dahulu untuk menyunting.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReferenceChainEditor id={rc.id} rootId={rc.root_node_id} graph={rc.graph} editable={editable} title={rc.title} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Maklumat rantaian rujukan</CardTitle>
        </CardHeader>
        <CardContent>
          <ReferenceMetaForm
            id={rc.id}
            reference={reference}
            initial={{ title: rc.title, qiraat_id: rc.qiraat_id ?? '', riwayat_id: rc.riwayat_id ?? '', tariq_id: rc.tariq_id ?? '', notes: rc.notes ?? '' }}
          />
        </CardContent>
      </Card>
    </>
  );
}
