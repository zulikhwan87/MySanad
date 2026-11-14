import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/public/page-header';
import { Pagination } from '@/components/public/pagination';
import { EmptyState, NotConfigured } from '@/components/public/states';
import { StaggerItem, StaggerList } from '@/components/motion/motion';
import { getPublicInstitutions } from '@/lib/data/public-directory';
import { parseDirectoryParams } from '@/lib/validations/search';
import { getT } from '@/lib/i18n/server';
import { fmt } from '@/lib/i18n/dictionaries';

export const metadata: Metadata = { title: 'Institusi' };

export default async function InstitutionsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const params = parseDirectoryParams(searchParams);
  const result = await getPublicInstitutions({ q: params.q, page: params.halaman });
  const t = getT();
  const href = (page: number) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (page > 1) qs.set('halaman', String(page));
    const s = qs.toString();
    return s ? `/institutions?${s}` : '/institutions';
  };

  return (
    <>
      <PageHeader
        eyebrow={t.institutions.eyebrow}
        title={t.institutions.title}
        description={t.institutions.description}
      >
        <form className="flex max-w-xl gap-2 pt-2" role="search" action="/institutions">
          <label htmlFor="inst-q" className="sr-only">
            {t.institutions.searchLabel}
          </label>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="inst-q" name="q" type="search" defaultValue={params.q ?? ''} maxLength={100} placeholder={t.institutions.searchPlaceholder} className="ps-9" />
          </div>
          <Button type="submit">{t.common.search}</Button>
        </form>
      </PageHeader>
      <div className="container space-y-6 py-8">
        {!result ? (
          <NotConfigured />
        ) : result.total === 0 ? (
          <EmptyState title={t.institutions.none} />
        ) : (
          <>
            <StaggerList className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {result.items.map((i) => (
                <StaggerItem key={i.id}>
                  <Card className="flex h-full flex-col gap-3 p-5">
                    <div className="flex gap-3">
                      <Building2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
                      <div>
                        <h2 className="font-semibold text-forest-900">{i.name}</h2>
                        <p className="text-sm text-muted-foreground">
                          {i.category}
                          {i.state_name ? ` · ${[i.district_name, i.state_name].filter(Boolean).join(', ')}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
                      {i.is_verified ? <Badge variant="secondary">{t.institutions.verified}</Badge> : <span />}
                      {i.teacher_count > 0 ? (
                        <Link href={`/directory?institusi=${i.id}`} className="text-sm font-semibold text-primary hover:underline">
                          {fmt(t.institutions.teachers, { n: i.teacher_count })}
                        </Link>
                      ) : (
                        <span className="text-sm text-muted-foreground">{t.institutions.noTeachers}</span>
                      )}
                    </div>
                  </Card>
                </StaggerItem>
              ))}
            </StaggerList>
            <Pagination page={result.page} pageCount={result.pageCount} hrefFor={href} labels={t.common} />
          </>
        )}
      </div>
    </>
  );
}
