import type { Metadata } from 'next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PortalHeader } from '@/components/teacher/portal-header';
import { Pagination } from '@/components/public/pagination';
import { EmptyState } from '@/components/public/states';
import { fmtDate } from '@/components/admin/labels';
import { requireSuperAdmin } from '@/lib/auth/session';
import { getAuditLogs } from '@/lib/data/admin';

export const metadata: Metadata = { title: 'Log Audit' };

const TABLES = [
  'profiles', 'teachers', 'teacher_education', 'ijazah_records', 'documents', 'sanad_chains', 'sanad_nodes', 'sanad_edges',
  'verification_submissions', 'verification_reviews', 'teacher_change_requests', 'institutions', 'public_contact_channels',
];
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** Changed keys only, so entries stay readable. */
function changes(oldV: Record<string, unknown> | null, newV: Record<string, unknown> | null): string {
  if (!oldV || !newV) return '';
  return Object.keys(newV)
    .filter((k) => k !== 'updated_at' && JSON.stringify(oldV[k]) !== JSON.stringify(newV[k]))
    .map((k) => `${k}: ${JSON.stringify(oldV[k])} → ${JSON.stringify(newV[k])}`)
    .join('\n');
}

export default async function AuditLogsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  await requireSuperAdmin('/admin/audit-logs');
  const table = TABLES.includes(first(searchParams.jadual)) ? first(searchParams.jadual) : '';
  const action = /^(INSERT|UPDATE|DELETE|APP:[A-Z_]{1,60})$/.test(first(searchParams.tindakan)) ? first(searchParams.tindakan) : '';
  const page = Math.max(1, Number.parseInt(first(searchParams.halaman), 10) || 1);
  const result = await getAuditLogs({ table: table || undefined, action: action || undefined, page });
  const href = (p: number) => {
    const qs = new URLSearchParams();
    if (table) qs.set('jadual', table);
    if (action) qs.set('tindakan', action);
    if (p > 1) qs.set('halaman', String(p));
    const s = qs.toString();
    return s ? `/admin/audit-logs?${s}` : '/admin/audit-logs';
  };
  return (
    <>
      <PortalHeader title="Log Audit" description="Rekod tambah-sahaja yang dijana oleh pangkalan data. IC, telefon dan alamat dibuang sebelum disimpan." />
      <form className="flex flex-wrap gap-2" action="/admin/audit-logs">
        <label htmlFor="a-table" className="sr-only">
          Jadual
        </label>
        <select id="a-table" name="jadual" defaultValue={table} className="h-10 rounded-lg border border-input bg-card px-3 text-sm">
          <option value="">Semua jadual</option>
          {TABLES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <label htmlFor="a-action" className="sr-only">
          Tindakan
        </label>
        <select id="a-action" name="tindakan" defaultValue={action} className="h-10 rounded-lg border border-input bg-card px-3 text-sm">
          <option value="">Semua tindakan</option>
          {['INSERT', 'UPDATE', 'DELETE', 'APP:REVEAL_IC', 'APP:DOCUMENT_VIEW_URL', 'APP:DOCUMENT_DOWNLOAD_URL'].map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <Button type="submit">Tapis</Button>
      </form>
      <Card>
        <CardContent className="pt-6">
          {result.total === 0 ? (
            <EmptyState title="Tiada rekod" />
          ) : (
            <>
              <ol className="divide-y text-sm">
                {result.items.map((e) => {
                  const diff = changes(e.old_values, e.new_values);
                  return (
                    <li key={e.id} className="space-y-1 py-3">
                      <p className="flex flex-wrap gap-x-3">
                        <span className="font-mono font-semibold">{e.action}</span>
                        <span>{e.entity_table}</span>
                        <span className="font-mono text-xs text-muted-foreground">{e.entity_id}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fmtDate(e.created_at, true)} · {e.actor ? `${e.actor.full_name} (${e.actor.email})` : 'sistem'}
                        {e.actor_role ? ` · ${e.actor_role}` : ''}
                      </p>
                      {diff ? <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-2 text-xs">{diff}</pre> : null}
                      {!diff && e.new_values && e.action.startsWith('APP:') ? (
                        <pre className="whitespace-pre-wrap rounded-lg bg-muted p-2 text-xs">{JSON.stringify(e.new_values)}</pre>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
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
