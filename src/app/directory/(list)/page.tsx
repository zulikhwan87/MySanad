import type { Metadata } from 'next';
import { PageHeader } from '@/components/public/page-header';
import { SearchBox } from '@/components/public/search-box';
import { FilterBar } from '@/components/public/filter-bar';
import { TeacherGrid } from '@/components/public/teacher-grid';
import { Pagination } from '@/components/public/pagination';
import { EmptyState, NotConfigured } from '@/components/public/states';
import { getFilterOptions, getStateStats, searchTeachers } from '@/lib/data/public-directory';
import { directoryHref, parseDirectoryParams } from '@/lib/validations/search';
import { getLocale } from '@/lib/i18n/server';
import { fmt, getDictionary } from '@/lib/i18n/dictionaries';
import { intlLocale } from '@/lib/i18n/config';

export const metadata: Metadata = {
  title: 'Direktori Guru',
  description: 'Cari guru al-Quran yang profilnya telah disemak dan diterbitkan dalam MySanad.',
};

export default async function DirectoryPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const params = parseDirectoryParams(searchParams);
  const [result, options, states] = await Promise.all([searchTeachers(params), getFilterOptions(), getStateStats()]);
  const locale = getLocale();
  const t = getDictionary(locale);
  const intl = intlLocale(locale);

  return (
    <>
      <PageHeader
        eyebrow={t.directory.eyebrow}
        title={t.directory.title}
        description={t.directory.description}
      >
        <div className="max-w-2xl pt-2">
          <SearchBox live initialQuery={params.q ?? ''} basePath="/directory" />
        </div>
      </PageHeader>

      <div className="container space-y-6 py-8">
        {options && states ? (
          <FilterBar
            basePath="/directory"
            params={params}
            states={states}
            qiraat={options.qiraat}
            riwayat={options.riwayat}
            institutions={options.institutions}
          />
        ) : null}

        {!result ? (
          <NotConfigured />
        ) : result.total === 0 ? (
          <EmptyState title={t.directory.noResults}>
            {params.q ? `${fmt(t.directory.noResultsFor, { q: params.q })} ` : null}
            {t.directory.noResultsHint}
          </EmptyState>
        ) : (
          <>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {fmt(t.directory.found, { n: result.total.toLocaleString(intl) })} · {fmt(t.common.pageOf, { page: result.page, pages: result.pageCount })}
            </p>
            <TeacherGrid teachers={result.items} />
            <Pagination
              page={result.page}
              pageCount={result.pageCount}
              hrefFor={(p) => directoryHref('/directory', params, { halaman: p })}
              labels={t.common}
            />
          </>
        )}
      </div>
    </>
  );
}
