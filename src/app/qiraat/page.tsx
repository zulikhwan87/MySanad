import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/public/page-header';
import { NotConfigured, EmptyState } from '@/components/public/states';
import { getQiraatStats } from '@/lib/data/public-directory';
import { getLocale } from '@/lib/i18n/server';
import { fmt, getDictionary } from '@/lib/i18n/dictionaries';
import { intlLocale } from '@/lib/i18n/config';

export const metadata: Metadata = { title: 'Qiraat & Riwayat' };

export default async function QiraatPage() {
  const qiraat = await getQiraatStats();
  const locale = getLocale();
  const t = getDictionary(locale);
  const num = (n: number) => fmt(t.qiraat.teachers, { n: n.toLocaleString(intlLocale(locale)) });

  return (
    <>
      <PageHeader eyebrow={t.qiraat.eyebrow} title={t.qiraat.title} description={t.qiraat.description} />
      <div className="container py-8">
        {!qiraat ? (
          <NotConfigured />
        ) : qiraat.length === 0 ? (
          <EmptyState title={t.qiraat.empty} />
        ) : (
          <ul className="grid gap-4 md:grid-cols-2">
            {qiraat.map((q) => (
              <li key={q.id} className="rounded-2xl border bg-card p-5 shadow-soft">
                <Link href={`/directory?qiraat=${q.id}`} className="group flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block font-semibold text-forest-900 group-hover:text-primary">{q.title_rumi}</span>
                    <span lang="ar" className="arabic block text-forest-700">
                      {q.title_arabic}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-forest-900">
                    {num(q.teacher_count)}
                  </span>
                </Link>
                {q.riwayat.length ? (
                  <div className="mt-4 border-t pt-3">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">{t.qiraat.riwayatLabel}</p>
                    <ul className="divide-y">
                      {q.riwayat.map((r) => (
                        <li key={r.id}>
                          <Link
                            href={`/directory?riwayat=${r.id}`}
                            className="flex items-center justify-between gap-3 py-2 text-sm hover:text-primary"
                          >
                            <span className="min-w-0">{r.label_rumi}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">{num(r.teacher_count)}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
