import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PortalHeader } from '@/components/teacher/portal-header';
import { NotConfigured } from '@/components/public/states';
import { fmtDate } from '@/components/admin/labels';
import { CopyFromChainForm, NewReferenceChainForm, ReferenceStatusBadge } from '@/components/admin/reference-chains/reference-forms';
import { requireAdminPortal } from '@/lib/auth/session';
import { getCopyableChains, listReferenceChains, referenceChainsEnabled } from '@/lib/data/reference-chains';
import { getTeacherReferenceData } from '@/lib/data/teacher';

export const metadata: Metadata = { title: 'Rantaian Rujukan' };

export default async function ReferenceChainsPage() {
  await requireAdminPortal('/admin/reference-chains');
  const [chains, copyable, reference, enabled] = await Promise.all([
    listReferenceChains(),
    getCopyableChains(),
    getTeacherReferenceData(),
    referenceChainsEnabled(),
  ]);
  if (!reference) return <NotConfigured />;

  return (
    <>
      <PortalHeader
        title="Rantaian Rujukan"
        description="Bahagian atas sanad yang lazim, disediakan oleh pentadbir supaya guru tidak perlu menaipnya semula."
      />
      {!enabled ? (
        <Alert variant="destructive">
          Fungsi ini sedang <strong>dimatikan</strong> di Tetapan. Guru tidak melihat rantaian rujukan; anda masih boleh menyediakannya di sini.
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cara ia berfungsi</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-1 ps-5 text-sm text-muted-foreground">
            <li>Cipta draf sendiri, atau salin bahagian atas daripada rantaian guru yang telah diluluskan.</li>
            <li>Semak setiap perawi dan hubungan satu demi satu. Betulkan, ganti atau buang jika perlu.</li>
            <li>Klik Aktifkan. Hanya rantaian aktif kelihatan kepada guru.</li>
            <li>Guru menyalin bahagian yang diperlukan ke dalam rantaian mereka; salinan itu disemak bersama rantaian guru.</li>
            <li>Nyahaktifkan atau padam pada bila-bila masa. Rantaian guru yang sudah menyalinnya tidak berubah.</li>
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Senarai rantaian rujukan</CardTitle>
          <CardDescription>{chains.length} rantaian</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {chains.length ? (
            <ul className="divide-y rounded-xl border">
              {chains.map((c) => (
                <li key={c.id}>
                  <Link href={`/admin/reference-chains/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 p-3 hover:bg-secondary/60">
                    <span className="min-w-0">
                      <span className="block font-medium text-forest-900">{c.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {[c.riwayat, c.tariq, `bermula: ${c.root_name}`, `${c.link_count} hubungan`].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      <ReferenceStatusBadge status={c.status} />
                      {fmtDate(c.updated_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Belum ada rantaian rujukan.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <NewReferenceChainForm reference={reference} />
            <CopyFromChainForm chains={copyable} />
          </div>
        </CardContent>
      </Card>
    </>
  );
}
