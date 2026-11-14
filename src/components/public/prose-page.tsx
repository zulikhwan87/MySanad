import { PageHeader } from './page-header';
import { getLocale } from '@/lib/i18n/server';
import { getDictionary } from '@/lib/i18n/dictionaries';

export function ProsePage({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <>
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <MalayOnlyNotice />
      <article className="container max-w-3xl space-y-6 py-10 leading-relaxed text-forest-900/90 [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-forest-900 [&_li]:ms-5 [&_li]:list-disc [&_ul]:space-y-1">
        {children}
      </article>
    </>
  );
}

export function DraftNotice() {
  return (
    <p className="rounded-xl border border-gold-300 bg-gold-50 p-4 text-sm text-gold-700">
      Draf kerja: teks ini perlu disemak oleh penasihat undang-undang sebelum platform dilancarkan secara rasmi.
    </p>
  );
}

/** Legal and editorial pages are maintained in Bahasa Melayu only; say so in other languages. */
function MalayOnlyNotice() {
  const locale = getLocale();
  if (locale === 'ms') return null;
  return (
    <p className="container max-w-3xl pt-6 text-sm text-muted-foreground" lang={locale}>
      {getDictionary(locale).common.malayOnly}
    </p>
  );
}
