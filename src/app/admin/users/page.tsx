import type { Metadata } from 'next';
import { Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PortalHeader } from '@/components/teacher/portal-header';
import { Pagination } from '@/components/public/pagination';
import { EmptyState } from '@/components/public/states';
import { UserRowActions } from '@/components/admin/user-row-actions';
import { fmtDate } from '@/components/admin/labels';
import { requireSuperAdmin } from '@/lib/auth/session';
import { ROLE_LABELS } from '@/lib/auth/roles';
import { getAdminUsers } from '@/lib/data/admin';

export const metadata: Metadata = { title: 'Pengguna & Peranan' };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export default async function AdminUsersPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const me = await requireSuperAdmin('/admin/users');
  const q = first(searchParams.q).trim().slice(0, 100);
  const role = first(searchParams.peranan) in ROLE_LABELS ? first(searchParams.peranan) : '';
  const page = Math.max(1, Number.parseInt(first(searchParams.halaman), 10) || 1);
  const result = await getAdminUsers({ q: q || undefined, role: role || undefined, page });
  const href = (p: number) => {
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (role) qs.set('peranan', role);
    if (p > 1) qs.set('halaman', String(p));
    const s = qs.toString();
    return s ? `/admin/users?${s}` : '/admin/users';
  };
  return (
    <>
      <PortalHeader
        title="Pengguna & Peranan"
        description="Hanya Super Admin boleh melantik atau menarik balik peranan pentadbir. Setiap perubahan direkod dalam log audit."
      />
      <form className="flex flex-wrap gap-2" action="/admin/users" role="search">
        <label htmlFor="u-q" className="sr-only">
          Cari pengguna
        </label>
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id="u-q" name="q" defaultValue={q} placeholder="Nama atau emel" className="pl-9" maxLength={100} />
        </div>
        <label htmlFor="u-role" className="sr-only">
          Peranan
        </label>
        <select id="u-role" name="peranan" defaultValue={role} className="h-10 rounded-lg border border-input bg-card px-3 text-sm">
          <option value="">Semua peranan</option>
          {Object.entries(ROLE_LABELS).map(([k, v]) => (
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
            <EmptyState title="Tiada pengguna" />
          ) : (
            <>
              <ul className="divide-y">
                {result.items.map((u) => (
                  <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <span>
                      <span className="block font-medium text-forest-900">
                        {u.full_name} {!u.is_active ? <Badge variant="destructive">Tidak aktif</Badge> : null}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {u.email} · {ROLE_LABELS[u.role]} · sejak {fmtDate(u.created_at)}
                      </span>
                    </span>
                    <UserRowActions userId={u.id} role={u.role} active={u.is_active} isSelf={u.id === me.id} />
                  </li>
                ))}
              </ul>
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
