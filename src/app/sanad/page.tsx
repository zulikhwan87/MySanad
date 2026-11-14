import type { Metadata } from 'next';
import Link from 'next/link';
import { GitBranch } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/public/page-header';
import { EmptyState, NotConfigured } from '@/components/public/states';
import { DemoBadge } from '@/components/public/verification-badges';
import { SanadGraphLazy } from '@/components/sanad/sanad-graph-lazy';
import { getPublicSanadGraph } from '@/lib/data/sanad';
import { getFilterOptions } from '@/lib/data/public-directory';
import { UuidSchema } from '@/lib/validations/search';
import { getT } from '@/lib/i18n/server';
import { fmt } from '@/lib/i18n/dictionaries';

export const metadata: Metadata = {
  title: 'Graf Sanad',
  description: 'Terokai hubungan periwayatan al-Quran yang didokumenkan dan disemak dalam MySanad.',
};

const uuidOrUndefined = (v: string | string[] | undefined) => {
  const s = Array.isArray(v) ? v[0] : v;
  return UuidSchema.safeParse(s).success ? s : undefined;
};

export default async function SanadExplorerPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const qiraatId = uuidOrUndefined(searchParams.qiraat);
  const riwayatId = uuidOrUndefined(searchParams.riwayat);
  const [graph, options] = await Promise.all([getPublicSanadGraph({ qiraatId, riwayatId }), getFilterOptions()]);
  const t = getT();

  return (
    <>
      <PageHeader
        eyebrow={t.sanadPages.eyebrow}
        title={t.sanadPages.title}
        description={t.sanadPages.description}
      >
        {options ? (
          <form className="flex flex-wrap gap-2 pt-2" action="/sanad">
            <label className="sr-only" htmlFor="sx-qiraat">
              {t.filters.qiraat}
            </label>
            <select id="sx-qiraat" name="qiraat" defaultValue={qiraatId ?? ''} className="h-10 rounded-lg border border-input bg-card px-3 text-sm">
              <option value="">{t.filters.allQiraat}</option>
              {options.qiraat.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.label}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="sx-riwayat">
              {t.filters.riwayat}
            </label>
            <select id="sx-riwayat" name="riwayat" defaultValue={riwayatId ?? ''} className="h-10 rounded-lg border border-input bg-card px-3 text-sm">
              <option value="">{t.filters.allRiwayat}</option>
              {options.riwayat.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
              {t.common.filter}
            </button>
          </form>
        ) : null}
      </PageHeader>

      <div className="container space-y-8 py-8">
        {!graph ? (
          <NotConfigured />
        ) : graph.edges.length === 0 ? (
          <EmptyState title={t.sanadPages.empty}>
            {t.sanadPages.emptyBody}
          </EmptyState>
        ) : (
          <>
            <SanadGraphLazy
              data={graph}
              mode="public"
              title="Graf Sanad MySanad"
              allowExport={graph.chains.length > 0 && graph.chains.every((c) => c.allow_export)}
              height={640}
            />
            <section aria-labelledby="senarai-rantaian" className="space-y-3">
              <h2 id="senarai-rantaian" className="text-lg font-semibold text-forest-900">
                {fmt(t.sanadPages.chains, { n: graph.chains.length })}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {graph.chains.map((c) => (
                  <li key={c.id}>
                    <Link href={`/sanad/${c.id}`}>
                      <Card className="h-full p-4 hover:shadow-md">
                        <p className="flex items-start gap-2 font-semibold text-forest-900">
                          <GitBranch className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                          {c.title}
                        </p>
                        <p className="text-sm text-muted-foreground">{c.teacher_name}</p>
                        <p className="text-xs text-muted-foreground">{[c.riwayat, c.tariq].filter(Boolean).join(' · ')}</p>
                        {c.is_demo_record ? (
                          <div className="mt-2">
                            <DemoBadge />
                          </div>
                        ) : null}
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </>
  );
}
