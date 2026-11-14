'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/client';

interface Suggestion {
  id: string;
  name: string;
  arabic: string | null;
  location: string;
}

/**
 * Debounced teacher search with accessible suggestions (ARIA combobox).
 * - `live`: also updates the results URL while typing (directory pages).
 * - Without `live`, submitting navigates to `basePath?q=...` (homepage).
 */
export function SearchBox({
  basePath = '/directory',
  initialQuery = '',
  live = false,
  placeholder,
  size = 'default',
}: {
  basePath?: string;
  initialQuery?: string;
  live?: boolean;
  placeholder?: string;
  size?: 'default' | 'lg';
}) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const listId = useId();
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const debounced = useDebouncedValue(query.trim(), 300);
  const touched = useRef(false);

  function hrefFor(q: string) {
    const params = new URLSearchParams(pathname === basePath ? searchParams.toString() : '');
    params.delete('halaman');
    if (q) params.set('q', q);
    else params.delete('q');
    const s = params.toString();
    return s ? `${basePath}?${s}` : basePath;
  }

  // Suggestions
  useEffect(() => {
    if (!touched.current || debounced.length < 2) {
      setSuggestions([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/search/suggest?q=${encodeURIComponent(debounced)}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : { suggestions: [] }))
      .then((d: { suggestions: Suggestion[] }) => {
        setSuggestions(d.suggestions ?? []);
        setActive(-1);
        setOpen(true);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [debounced]);

  // Live results
  useEffect(() => {
    if (!live || !touched.current) return;
    if ((searchParams.get('q') ?? '') === debounced) return;
    router.replace(hrefFor(debounced), { scroll: false });
    // hrefFor depends on searchParams; only re-run when the debounced text changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced, live]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setOpen(false);
    if (active >= 0 && suggestions[active]) {
      router.push(`/directory/${suggestions[active].id}`);
      return;
    }
    router.push(hrefFor(query.trim()));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  }

  const showList = open && debounced.length >= 2;

  return (
    <form role="search" onSubmit={submit} className="relative w-full">
      <label htmlFor={`${listId}-input`} className="sr-only">
        {t.search.label}
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id={`${listId}-input`}
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showList}
            aria-controls={`${listId}-list`}
            aria-activedescendant={active >= 0 ? `${listId}-opt-${active}` : undefined}
            autoComplete="off"
            dir="auto"
            maxLength={100}
            value={query}
            placeholder={placeholder ?? t.search.placeholder}
            onChange={(e) => {
              touched.current = true;
              setQuery(e.target.value);
            }}
            onKeyDown={onKeyDown}
            onFocus={() => suggestions.length && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            className={cn('ps-9 pe-9', size === 'lg' && 'h-12 text-base')}
          />
          {loading ? (
            <Loader2 className="absolute end-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-label={t.search.loadingSuggestions} />
          ) : null}
        </div>
        <Button type="submit" size={size === 'lg' ? 'lg' : 'default'} className={size === 'lg' ? 'h-12' : undefined}>
          {t.search.submit}
        </Button>
      </div>

      {showList ? (
        <ul
          id={`${listId}-list`}
          role="listbox"
          aria-label={t.search.suggestions}
          className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-soft"
        >
          {suggestions.length === 0 && !loading ? (
            <li className="px-4 py-3 text-sm text-muted-foreground" role="option" aria-selected={false} aria-disabled>
              {t.search.noSuggestions}
            </li>
          ) : null}
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              id={`${listId}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                router.push(`/directory/${s.id}`);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn('cursor-pointer px-4 py-2.5 text-sm', i === active && 'bg-secondary')}
            >
              <span className="block font-medium text-forest-900">{s.name}</span>
              <span className="flex justify-between gap-3 text-xs text-muted-foreground">
                <span>{s.location}</span>
                {s.arabic ? (
                  <span lang="ar" className="arabic">
                    {s.arabic}
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
