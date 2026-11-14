import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { PortalHeader } from '@/components/teacher/portal-header';
import { EmptyState } from '@/components/public/states';
import { InstitutionActions } from '@/components/admin/institution-actions';
import { fmtDate } from '@/components/admin/labels';
import { getAdminInstitutions } from '@/lib/data/admin';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Pengurusan Institusi' };

const FILTERS = [
  { key: 'unverified', label: 'Belum disahkan' },
  { key: 'verified', label: 'Disahkan' },
  { key: 'archived', label: 'Diarkib' },
] as const;

export default async function AdminInstitutionsPage({ searchParams }: { searchParams: { penapis?: string } }) {
  const filter = FILTERS.find((f) => f.key === searchParams.penapis)?.key ?? 'unverified';
  const items = await getAdminInstitutions({ filter });
  return (
    <>
      <PortalHeader title="Pengurusan Institusi" description="Institusi yang dicadangkan oleh guru kekal 'belum disahkan' sehingga disemak." />
      <nav aria-label="Penapis" className="flex gap-1">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/admin/institutions?penapis=${f.key}`}
            aria-current={filter === f.key ? 'page' : undefined}
            className={cn('rounded-full border px-3 py-1 text-sm', filter === f.key ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-secondary')}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      <Card>
        <CardContent className="pt-6">
          {items.length === 0 ? (
            <EmptyState title="Tiada institusi" />
          ) : (
            <ul className="divide-y">
              {items.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span>
                    <span className="block font-medium text-forest-900">{i.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {i.category} · {i.state?.name ?? '—'} · {fmtDate(i.created_at)}
                    </span>
                  </span>
                  <InstitutionActions id={i.id} verified={i.is_verified} archived={i.is_archived} name={i.name} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
