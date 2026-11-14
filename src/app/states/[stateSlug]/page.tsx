import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/public/page-header';
import { StateGrid } from '@/components/public/state-grid';
import { SearchBox } from '@/components/public/search-box';
import { FilterBar } from '@/components/public/filter-bar';
import { TeacherGrid } from '@/components/public/teacher-grid';
import { Pagination } from '@/components/public/pagination';
import { EmptyState, NotConfigured } from '@/components/public/states';
import { getDistrictStats, getFilterOptions, getStateStats, searchTeachers } from '@/lib/data/public-directory';
import { MALAYSIAN_STATES } from '@/lib/constants/malaysia-data';
import { directoryHref, parseDirectoryParams } from '@/lib/validations/search';
import { getLocale } from '@/lib/i18n/server';
import { fmt, getDictionary } from '@/lib/i18n/dictionaries';
import { intlLocale } from '@/lib/i18n/config';

interface Props {
  params: { stateSlug: string };
  searchParams: Record<string, string | string[] | undefined>;
}

export function generateMetadata({ params }: Props): Metadata {
  const state = MALAYSIAN_STATES.find((s) => s.slug === params.stateSlug);
  return { title: state ? `Guru al-Quran di ${state.name}` : 'Negeri tidak ditemui' };
}

export default async function StateDirectoryPage({ params, searchParams }: Props) {
  const known = MALAYSIAN_STATES.find((s) => s.slug === params.stateSlug);
  if (!known) notFound();
  const locale = getLocale();
  const t = getDictionary(locale);
  const intl = intlLocale(locale);

  const states = await getStateStats();
  if (!states) {
    return (
      <>
        <PageHeader eyebrow={t.states.eyebrow} title={fmt(t.states.stateTitle, { state: known.name })} />
        <div className="container py-8">
          <NotConfigured />
        </div>
      </>
    );
  }
  const state = states.find((s) => s.slug === params.stateSlug);
  if (!state) notFound();

  const basePath = `/states/${state.slug}`;
  const query = { ...parseDirectoryParams(searchParams), negeri: undefined };
  const [districts, options, result] = await Promise.all([
    getDistrictStats(state.id),
    getFilterOptions(state.slug),
    searchTeachers({ ...query, stateSlug: state.slug }),
  ]);

  return (
    <>
      <PageHeader
        eyebrow={state.is_federal_territory ? t.states.eyebrowFt : t.states.eyebrow}
        title={fmt(t.states.stateTitle, { state: state.name })}
        description={fmt(t.states.stateDescription, { n: state.teacher_count.toLocaleString(intl) })}
      >
        <div className="max-w-2xl pt-2">
          <SearchBox live basePath={basePath} initialQuery={query.q ?? ''} placeholder={fmt(t.search.placeholderIn, { state: state.name })} />
        </div>
      </PageHeader>

      <div className="container space-y-6 py-8">
        <details className="rounded-2xl border bg-card p-4 shadow-soft">
          <summary className="cursor-pointer text-sm font-medium text-forest-900">{t.states.change}</summary>
          <div className="pt-4">
            <StateGrid states={states} selectedSlug={state.slug} />
          </div>
        </details>

        {options && districts ? (
          <FilterBar
            basePath={basePath}
            params={query}
            districts={districts}
            qiraat={options.qiraat}
            riwayat={options.riwayat}
            institutions={options.institutions}
          />
        ) : null}

        {!result ? (
          <NotConfigured />
        ) : result.total === 0 ? (
          <EmptyState title={fmt(t.states.noneIn, { state: state.name })}>
            {state.teacher_count === 0 ? t.states.noneYet : t.states.tryOther}
          </EmptyState>
        ) : (
          <>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {fmt(t.directory.found, { n: result.total.toLocaleString(intl) })} · {fmt(t.common.pageOf, { page: result.page, pages: result.pageCount })}
            </p>
            <TeacherGrid teachers={result.items} />
            <Pagination page={result.page} pageCount={result.pageCount} hrefFor={(p) => directoryHref(basePath, query, { halaman: p })} labels={t.common} />
          </>
        )}
      </div>
    </>
  );
}
