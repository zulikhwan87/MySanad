import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { PortalHeader } from '@/components/teacher/portal-header';
import { StatusBadge } from '@/components/teacher/status-badge';
import { EmptyState } from '@/components/public/states';
import { Pagination } from '@/components/public/pagination';
import { fmtDate } from '@/components/admin/labels';
import { getAdminChains } from '@/lib/data/admin';
import { STATUS_LABELS } from '@/lib/teacher/status';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Pengurusan Sanad' };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function AdminSanadPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const status = first(searchParams.status) in STATUS_LABELS ? first(searchParams.status) : '';
  const page = Math.max(1, Number.parseInt(first(searchParams.halaman), 10) || 1);
  const result = await getAdminChains({ status: status || undefined, page });
  const href = (s: string, p = 1) => {
    const qs = new URLSearchParams();
    if (s) qs.set('status', s);
    if (p > 1) qs.set('halaman', String(p));
    const str = qs.toString();
    return str ? `/admin/sanad?${str}` : '/admin/sanad';
  };
  return (
    <>
      <PortalHeader title="Pengurusan Sanad" description="Semua rantaian sanad. Keputusan dibuat melalui barisan semakan." />
      <nav aria-label="Status" className="flex flex-wrap gap-1">
        {['', 'submitted', 'under_review', 'approved', 'revision_required', 'suspended', 'draft'].map((s) => (
          <Link
            key={s || 'semua'}
            href={href(s)}
            aria-current={status === s ? 'page' : undefined}
            className={cn('rounded-full border px-3 py-1 text-sm', status === s ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-secondary')}
          >
            {s ? STATUS_LABELS[s as keyof typeof STATUS_LABELS] : 'Semua'}
          </Link>
        ))}
      </nav>
      <Card>
        <CardContent className="pt-6">
          {result.total === 0 ? (
            <EmptyState title="Tiada rantaian" />
          ) : (
            <>
              <ul className="divide-y">
                {result.items.map((c) => (
                  <li key={c.id}>
                    <Link href={`/admin/sanad/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-secondary/40">
                      <span>
                        <span className="block font-medium text-forest-900">{c.title}</span>
                        <span className="text-xs text-muted-foreground">
                          <span className="font-mono">{c.sanad_code}</span> · {c.teacher?.public_display_name} · {fmtDate(c.updated_at)}
                          {c.is_public ? ' · awam' : ''}
                        </span>
                      </span>
                      <StatusBadge status={c.verification_status} />
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-4">
                <Pagination page={result.page} pageCount={result.pageCount} hrefFor={(p) => href(status, p)} />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
