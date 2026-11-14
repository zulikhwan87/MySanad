'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Search, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { searchLinkableNodesAction, type LinkableNode } from '@/lib/actions/sanad-actions';
import { cn } from '@/lib/utils';
import { EMPTY_NODE, NodeFields } from './node-fields';
import type { NodeChoiceInput, SanadNodeInput } from '@/lib/validations/sanad';

function useNodeSearch(query: string) {
  const debounced = useDebouncedValue(query.trim(), 300);
  const [results, setResults] = useState<LinkableNode[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    if (debounced.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    searchLinkableNodesAction(debounced)
      .then((r) => !cancelled && setResults(r))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debounced]);
  return { results, loading };
}

function NodeOption({ n, selected, onPick }: { n: LinkableNode; selected: boolean; onPick: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        aria-pressed={selected}
        className={cn('w-full rounded-lg border p-2 text-left hover:bg-secondary', selected && 'border-primary bg-secondary')}
      >
        <span className="block text-sm font-medium text-forest-900">{n.full_name_rumi}</span>
        {n.full_name_arabic ? (
          <span lang="ar" dir="rtl" className="arabic block text-sm text-forest-700">
            {n.full_name_arabic}
          </span>
        ) : null}
        <span className="mt-1 flex flex-wrap gap-1 text-xs text-muted-foreground">
          <span>{n.generation_category}</span>
          {n.death_year_hijri ? <span>· w. {n.death_year_hijri}</span> : null}
          {n.country_or_region ? <span>· {n.country_or_region}</span> : null}
          <Badge variant={n.is_mine ? 'outline' : 'secondary'} className="ml-auto">
            {n.is_mine ? 'Rekod anda' : 'Disahkan'}
          </Badge>
        </span>
      </button>
    </li>
  );
}

/**
 * Choose an existing transmitter or create a new one. Similar names are shown for an
 * EXPLICIT decision; records are never merged automatically.
 */
export function NodePicker({
  value,
  onChange,
  errors,
  prefix = 'node.',
}: {
  value: NodeChoiceInput;
  onChange: (v: NodeChoiceInput) => void;
  errors: Record<string, string>;
  prefix?: string;
}) {
  const [query, setQuery] = useState('');
  const existing = useNodeSearch(query);
  const newName = value.mode === 'new' ? String(value.node.full_name_rumi ?? '') : '';
  const similar = useNodeSearch(newName);
  const [picked, setPicked] = useState<LinkableNode | null>(null);

  return (
    <div className="space-y-3">
      <div className="inline-flex rounded-lg border p-1" role="radiogroup" aria-label="Sumber perawi">
        <Button
          type="button"
          size="sm"
          variant={value.mode === 'existing' ? 'default' : 'ghost'}
          role="radio"
          aria-checked={value.mode === 'existing'}
          onClick={() => onChange({ mode: 'existing', node_id: picked?.id ?? '' })}
        >
          <Search aria-hidden /> Pilih sedia ada
        </Button>
        <Button
          type="button"
          size="sm"
          variant={value.mode === 'new' ? 'default' : 'ghost'}
          role="radio"
          aria-checked={value.mode === 'new'}
          onClick={() => onChange({ mode: 'new', node: { ...EMPTY_NODE } })}
        >
          <UserPlus aria-hidden /> Cipta baharu
        </Button>
      </div>

      {value.mode === 'existing' ? (
        <div className="space-y-2">
          <label htmlFor={`${prefix}search`} className="text-sm font-medium">
            Cari perawi (Rumi atau Arab)
          </label>
          <div className="relative">
            <input
              id={`${prefix}search`}
              type="search"
              dir="auto"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Taip sekurang-kurangnya 2 aksara"
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm"
            />
            {existing.loading ? <Loader2 className="absolute right-3 top-3 size-4 animate-spin text-muted-foreground" aria-label="Mencari" /> : null}
          </div>
          {errors.node_id ?? errors[`${prefix}node_id`] ? (
            <p className="text-xs font-medium text-destructive">{errors.node_id ?? errors[`${prefix}node_id`]}</p>
          ) : null}
          <ul className="max-h-64 space-y-1.5 overflow-auto">
            {existing.results.map((n) => (
              <NodeOption
                key={n.id}
                n={n}
                selected={value.node_id === n.id}
                onPick={() => {
                  setPicked(n);
                  onChange({ mode: 'existing', node_id: n.id });
                }}
              />
            ))}
          </ul>
          {query.trim().length >= 2 && !existing.loading && existing.results.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tiada padanan. Anda boleh mencipta perawi baharu.</p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Hanya perawi yang telah disahkan atau yang anda cipta sendiri dipaparkan.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {similar.results.length > 0 ? (
            <div className="rounded-xl border border-gold-300 bg-gold-50 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium text-gold-700">
                <AlertTriangle className="size-4" aria-hidden /> Perawi dengan nama serupa sudah wujud
              </p>
              <p className="mb-2 text-xs text-gold-700">
                Jika ia orang yang sama, pilih rekod sedia ada. Jika berbeza, teruskan mencipta rekod baharu. MySanad tidak
                menggabungkan rekod secara automatik.
              </p>
              <ul className="space-y-1.5">
                {similar.results.slice(0, 4).map((n) => (
                  <NodeOption
                    key={n.id}
                    n={n}
                    selected={false}
                    onPick={() => {
                      setPicked(n);
                      onChange({ mode: 'existing', node_id: n.id });
                    }}
                  />
                ))}
              </ul>
            </div>
          ) : null}
          <NodeFields
            value={value.node as SanadNodeInput}
            onChange={(node) => onChange({ mode: 'new', node })}
            errors={errors}
            prefix={prefix}
            compact
          />
        </div>
      )}
    </div>
  );
}
