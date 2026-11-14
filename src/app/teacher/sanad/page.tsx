import type { Metadata } from 'next';
import Link from 'next/link';
import { GitBranch, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PortalHeader } from '@/components/teacher/portal-header';
import { StatusBadge } from '@/components/teacher/status-badge';
import { NeedsTeacher } from '@/components/teacher/needs-teacher';
import { EmptyState, NotConfigured } from '@/components/public/states';
import { getMyTeacherContext } from '@/lib/data/teacher';
import { getMySanadChains } from '@/lib/data/sanad';

export const metadata: Metadata = { title: 'Sanad Saya' };

export default async function TeacherSanadListPage() {
  const [ctx, chains] = await Promise.all([getMyTeacherContext(), getMySanadChains()]);
  if (!ctx || !chains) return <NotConfigured />;
  if (!ctx.teacher) {
    return (
      <>
        <PortalHeader title="Sanad Saya" />
        <NeedsTeacher />
      </>
    );
  }

  return (
    <>
      <PortalHeader
        title="Sanad Saya"
        description="Dokumenkan setiap rantaian sanad anda. Setiap rantaian disemak secara berasingan oleh pentadbir."
        actions={
          <Button asChild>
            <Link href="/teacher/sanad/new">
              <Plus aria-hidden /> Tambah rantaian
            </Link>
          </Button>
        }
      />
      {chains.length === 0 ? (
        <EmptyState title="Belum ada rantaian sanad">Tambah rantaian pertama anda bermula dengan syeikh yang memberi ijazah kepada anda.</EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {chains.map((c) => (
            <li key={c.id}>
              <Link href={`/teacher/sanad/${c.id}`} className="block h-full">
                <Card className="flex h-full flex-col gap-2 p-5 transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-3">
                      <GitBranch className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
                      <div>
                        <p className="font-semibold text-forest-900">{c.title}</p>
                        <p className="text-sm text-muted-foreground">{[c.riwayat, c.qiraat].filter(Boolean).join(' · ')}</p>
                      </div>
                    </div>
                    <StatusBadge status={c.verification_status} />
                  </div>
                  <p className="mt-auto text-xs text-muted-foreground">
                    <span className="font-mono">{c.sanad_code}</span> · {c.edge_count} hubungan
                    {c.generation_depth ? ` · ${c.generation_depth} peringkat` : ''}
                    {c.supersedes_chain_id ? ' · semakan baharu' : ''}
                  </p>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
