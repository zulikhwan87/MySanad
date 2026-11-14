import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { PortalHeader } from '@/components/teacher/portal-header';
import { StatusBadge } from '@/components/teacher/status-badge';
import { EmptyState } from '@/components/public/states';
import { Pagination } from '@/components/public/pagination';
import { TARGET_LABELS, daysWaiting, fmtDate } from '@/components/admin/labels';
import { getChangeRequests, getReviewQueue } from '@/lib/data/admin';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Barisan Semakan' };

const TYPES = [
  { key: '', label: 'Semua' },
  { key: 'teacher_profile', label: 'Profil' },
  { key: 'ijazah_document', label: 'Dokumen' },
  { key: 'sanad_chain', label: 'Sanad' },
  { key: 'perubahan', label: 'Permohonan perubahan' },
];

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function VerificationQueuePage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const type = TYPES.some((t) => t.key === first(searchParams.jenis)) ? first(searchParams.jenis) : '';
  const open = first(searchParams.status) !== 'selesai';
  const page = Math.max(1, Number.parseInt(first(searchParams.halaman), 10) || 1);
  const href = (o: { jenis?: string; status?: string; halaman?: number }) => {
    const qs = new URLSearchParams();
    const j = o.jenis ?? type;
    const st = o.status ?? (open ? '' : 'selesai');
    if (j) qs.set('jenis', j);
    if (st) qs.set('status', st);
    if (o.halaman && o.halaman > 1) qs.set('halaman', String(o.halaman));
    const s = qs.toString();
    return s ? `/admin/verification?${s}` : '/admin/verification';
  };

  const isChange = type === 'perubahan';
  const [queue, changes] = await Promise.all([
    isChange ? null : getReviewQueue({ open, type: type || undefined, page }),
    isChange ? getChangeRequests(open) : null,
  ]);

  return (
    <>
      <PortalHeader title="Barisan Semakan" description="Permohonan disusun dari yang paling lama menunggu. Setiap jenis rekod diputuskan secara berasingan." />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Jenis permohonan" className="flex flex-wrap gap-1">
          {TYPES.map((t) => (
            <Link
              key={t.key || 'semua'}
              href={href({ jenis: t.key, halaman: 1 })}
              aria-current={type === t.key ? 'page' : undefined}
              className={cn('rounded-full border px-3 py-1 text-sm', type === t.key ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-secondary')}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <nav aria-label="Status" className="flex gap-1 text-sm">
          <Link href={href({ status: '', halaman: 1 })} aria-current={open ? 'page' : undefined} className={cn('rounded-lg px-3 py-1', open && 'bg-secondary font-medium')}>
            Terbuka
          </Link>
          <Link href={href({ status: 'selesai', halaman: 1 })} aria-current={!open ? 'page' : undefined} className={cn('rounded-lg px-3 py-1', !open && 'bg-secondary font-medium')}>
            Selesai
          </Link>
        </nav>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isChange ? (
            changes!.length === 0 ? (
              <EmptyState title="Tiada permohonan perubahan" />
            ) : (
              <ul className="divide-y">
                {changes!.map((c) => (
                  <li key={c.id}>
                    <Link href={`/admin/change-requests/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-secondary/40">
                      <span>
                        <span className="block font-medium text-forest-900">{c.teacher?.public_display_name}</span>
                        <span className="text-xs text-muted-foreground">
                          {Object.keys(c.proposed_changes).length} medan · {fmtDate(c.created_at)}
                        </span>
                      </span>
                      <StatusBadge status={c.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )
          ) : queue!.total === 0 ? (
            <EmptyState title={open ? 'Tiada permohonan menunggu' : 'Tiada permohonan yang telah diputuskan'} />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3">Kod</th>
                      <th className="py-2 pr-3">Jenis</th>
                      <th className="py-2 pr-3">Guru</th>
                      <th className="py-2 pr-3">{open ? 'Menunggu' : 'Diputuskan'}</th>
                      <th className="py-2 pr-3">Penyemak</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {queue!.items.map((s) => (
                      <tr key={s.id} className="hover:bg-secondary/40">
                        <td className="py-2 pr-3 font-mono">
                          <Link href={`/admin/verification/${s.id}`} className="text-primary hover:underline">
                            {s.submission_code}
                          </Link>
                        </td>
                        <td className="py-2 pr-3">{TARGET_LABELS[s.target_type] ?? s.target_type}</td>
                        <td className="py-2 pr-3">{s.teacher?.public_display_name}</td>
                        <td className="py-2 pr-3">{open ? `${daysWaiting(s.submitted_at)} hari` : fmtDate(s.decided_at)}</td>
                        <td className="py-2 pr-3">{s.reviewer?.full_name ?? '—'}</td>
                        <td className="py-2">
                          <StatusBadge status={s.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4">
                <Pagination page={queue!.page} pageCount={queue!.pageCount} hrefFor={(p) => href({ halaman: p })} />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
