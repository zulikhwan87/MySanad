import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PaginationLabels {
  prev: string;
  next: string;
  pagination: string;
}

const DEFAULT_LABELS: PaginationLabels = { prev: 'Sebelum', next: 'Seterusnya', pagination: 'Penomboran' };

/** Server-rendered pagination; `hrefFor(page)` builds each link. Pass `labels` from the page's dictionary. */
export function Pagination({
  page,
  pageCount,
  hrefFor,
  labels = DEFAULT_LABELS,
}: {
  page: number;
  pageCount: number;
  hrefFor: (page: number) => string;
  labels?: PaginationLabels;
}) {
  if (pageCount <= 1) return null;
  const pages = Array.from(new Set([1, page - 1, page, page + 1, pageCount]))
    .filter((p) => p >= 1 && p <= pageCount)
    .sort((a, b) => a - b);

  const linkClass = 'inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-sm';
  return (
    <nav aria-label={labels.pagination} className="flex flex-wrap items-center justify-center gap-1.5">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={cn(linkClass, 'hover:bg-secondary')} rel="prev">
          <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
          <span className="sr-only sm:not-sr-only sm:ms-1">{labels.prev}</span>
        </Link>
      ) : null}
      {pages.map((p, i) => (
        <span key={p} className="flex items-center gap-1.5">
          {i > 0 && p - pages[i - 1] > 1 ? <span className="px-1 text-muted-foreground">…</span> : null}
          <Link
            href={hrefFor(p)}
            aria-current={p === page ? 'page' : undefined}
            className={cn(linkClass, p === page ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-secondary')}
          >
            {p}
          </Link>
        </span>
      ))}
      {page < pageCount ? (
        <Link href={hrefFor(page + 1)} className={cn(linkClass, 'hover:bg-secondary')} rel="next">
          <span className="sr-only sm:not-sr-only sm:me-1">{labels.next}</span>
          <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
        </Link>
      ) : null}
    </nav>
  );
}
