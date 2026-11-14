'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/client';
import { fmt } from '@/lib/i18n/dictionaries';
import type { StateStat } from '@/types/public';

/**
 * Responsive grid of the 13 states and 3 Federal Territories with live counts.
 * (A geographic map is intentionally not drawn: no verified map asset is bundled,
 * and an inaccurate map is worse than a clear list.)
 */
export function StateGrid({ states, selectedSlug }: { states: StateStat[]; selectedSlug?: string }) {
  const { t } = useI18n();
  const groups: Array<{ title: string; items: StateStat[] }> = [
    { title: t.states.peninsula, items: states.filter((s) => s.region === 'Semenanjung' && !s.is_federal_territory) },
    { title: t.states.borneo, items: states.filter((s) => s.region === 'Borneo' && !s.is_federal_territory) },
    { title: t.states.federal, items: states.filter((s) => s.is_federal_territory) },
  ];

  return (
    <nav aria-label={t.states.selector} className="space-y-5">
      {groups.map((g) =>
        g.items.length ? (
          <section key={g.title} aria-label={g.title}>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</h3>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {g.items.map((s) => {
                const selected = s.slug === selectedSlug;
                return (
                  <li key={s.slug}>
                    <Link
                      href={`/states/${s.slug}`}
                      aria-current={selected ? 'page' : undefined}
                      className={cn(
                        'flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2.5 text-sm font-medium transition-colors hover:border-primary hover:bg-secondary',
                        selected && 'border-primary bg-primary text-primary-foreground hover:bg-primary/90',
                      )}
                    >
                      <span className="truncate">{s.name.replace('Wilayah Persekutuan ', 'WP ')}</span>
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-xs tabular-nums',
                          selected ? 'bg-white/20' : s.teacher_count ? 'bg-forest-100 text-forest-800' : 'bg-muted text-muted-foreground',
                        )}
                        aria-label={fmt(t.states.teachers, { n: s.teacher_count })}
                      >
                        {s.teacher_count}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null,
      )}
    </nav>
  );
}
