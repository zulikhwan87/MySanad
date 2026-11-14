import type { Metadata } from 'next';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { PortalHeader } from '@/components/teacher/portal-header';
import { StatusBadge } from '@/components/teacher/status-badge';
import { EmptyState } from '@/components/public/states';
import { Pagination } from '@/components/public/pagination';
import { DemoBadge } from '@/components/public/verification-badges';
import { fmtDate } from '@/components/admin/labels';
import { getAdminTeachers } from '@/lib/data/admin';
import { STATUS_LABELS } from '@/lib/teacher/status';

export const metadata: Metadata = { title: 'Pengurusan Guru' };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function AdminTeachersPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const q = first(searchParams.q).trim().slice(0, 100);
  const status = first(searchParams.status) in STATUS_LABELS ? first(searchParams.status) : '';
  const page = Math.max(1, Number.parseInt(first(searchParams.halaman), 10) || 1);
  const result = await getAdminTeachers({ q: q || undefined, status: status || undefined, page });
  const href = (p: number) => {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (status) qs.set('status', status);
    if (p > 1) qs.set('halaman', String(p));
    const s = qs.toString();
    return s ? `/admin/teachers?${s}` : '/admin/teachers';
  };
  return (
    <>
      <PortalHeader title="Pengurusan Guru" description={`${result.total} guru`} />
      <form className="flex flex-wrap gap-2" action="/admin/teachers" role="search">
        <label htmlFor="t-q" className="sr-only">
          Cari guru
        </label>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id="t-q" name="q" defaultValue={q} placeholder="Nama atau kod guru" className="pl-9" maxLength={100} />
        </div>
        <label htmlFor="t-status" className="sr-only">
          Status
        </label>
        <select id="t-status" name="status" defaultValue={status} className="h-10 rounded-lg border border-input bg-card px-3 text-sm">
          <option value="">Semua status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <Button type="submit">Tapis</Button>
      </form>
      <Card>
        <CardContent className="pt-6">
          {result.total === 0 ? (
            <EmptyState title="Tiada guru ditemui" />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3">Kod</th>
                      <th className="py-2 pr-3">Nama</th>
                      <th className="py-2 pr-3">Negeri</th>
                      <th className="py-2 pr-3">Didaftar</th>
                      <th className="py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {result.items.map((t) => (
                      <tr key={t.id} className="hover:bg-secondary/40">
                        <td className="py-2 pr-3 font-mono">{t.teacher_code}</td>
                        <td className="py-2 pr-3">
                          <Link href={`/admin/teachers/${t.id}`} className="font-medium text-primary hover:underline">
                            {t.public_display_name}
                          </Link>
                          {t.is_demo_record ? <span className="ml-2"><DemoBadge /></span> : null}
                        </td>
                        <td className="py-2 pr-3">{t.state?.name ?? '—'}</td>
                        <td className="py-2 pr-3">{fmtDate(t.created_at)}</td>
                        <td className="py-2">
                          <StatusBadge status={t.profile_verification_status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4">
                <Pagination page={result.page} pageCount={result.pageCount} hrefFor={href} />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
