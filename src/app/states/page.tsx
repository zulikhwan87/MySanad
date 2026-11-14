import type { Metadata } from 'next';
import { PageHeader } from '@/components/public/page-header';
import { StateGrid } from '@/components/public/state-grid';
import { NotConfigured } from '@/components/public/states';
import { getStateStats } from '@/lib/data/public-directory';
import { getLocale } from '@/lib/i18n/server';
import { fmt, getDictionary } from '@/lib/i18n/dictionaries';
import { intlLocale } from '@/lib/i18n/config';

export const metadata: Metadata = { title: 'Negeri & Wilayah Persekutuan' };

export default async function StatesPage() {
  const states = await getStateStats();
  const total = states?.reduce((sum, s) => sum + s.teacher_count, 0) ?? 0;
  const locale = getLocale();
  const t = getDictionary(locale);
  return (
    <>
      <PageHeader
        eyebrow={t.states.eyebrow}
        title={t.states.title}
        description={t.states.description}
      />
      <div className="container space-y-4 py-8">
        {states ? (
          <>
            <p className="text-sm text-muted-foreground">{fmt(t.states.total, { n: total.toLocaleString(intlLocale(locale)) })}</p>
            <StateGrid states={states} />
          </>
        ) : (
          <NotConfigured />
        )}
      </div>
    </>
  );
}
