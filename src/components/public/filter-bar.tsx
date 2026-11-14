'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, X } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { directoryHref, type DirectoryParams } from '@/lib/validations/search';
import type { DistrictStat, ReferenceOption, StateStat } from '@/types/public';
import { useI18n } from '@/lib/i18n/client';

type FilterKey = 'negeri' | 'daerah' | 'qiraat' | 'riwayat' | 'institusi';

const selectClass =
  'h-10 w-full rounded-lg border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function FilterBar({
  basePath,
  params,
  districts,
  states,
  qiraat,
  riwayat,
  institutions,
}: {
  basePath: string;
  params: DirectoryParams;
  districts?: DistrictStat[];
  states?: StateStat[];
  qiraat: ReferenceOption[];
  riwayat: ReferenceOption[];
  institutions: ReferenceOption[];
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function update(key: FilterKey, value: string) {
    const overrides: Partial<Record<keyof DirectoryParams, string | undefined>> = { [key]: value || undefined };
    // A riwayat belongs to one qiraat: clear it when the qiraat changes.
    if (key === 'qiraat' && params.riwayat) {
      const r = riwayat.find((x) => x.id === params.riwayat);
      if (value && r?.parentId !== value) overrides.riwayat = undefined;
    }
    startTransition(() => router.push(directoryHref(basePath, params, overrides), { scroll: false }));
  }

  const visibleRiwayat = params.qiraat ? riwayat.filter((r) => r.parentId === params.qiraat) : riwayat;
  const active = Boolean(params.negeri || params.daerah || params.qiraat || params.riwayat || params.institusi);

  return (
    <div className="space-y-3" aria-busy={pending}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {states ? (
          <div className="space-y-1.5">
            <Label htmlFor="f-negeri">{t.filters.state}</Label>
            <select id="f-negeri" className={selectClass} value={params.negeri ?? ''} onChange={(e) => update('negeri', e.target.value)}>
              <option value="">{t.filters.allStates}</option>
              {states.map((st) => (
                <option key={st.slug} value={st.slug}>
                  {st.name} ({st.teacher_count})
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {districts ? (
          <div className="space-y-1.5">
            <Label htmlFor="f-daerah">{t.filters.district}</Label>
            <select id="f-daerah" className={selectClass} value={params.daerah ?? ''} onChange={(e) => update('daerah', e.target.value)}>
              <option value="">{t.filters.allDistricts}</option>
              {districts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.teacher_count})
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="f-qiraat">{t.filters.qiraat}</Label>
          <select id="f-qiraat" className={selectClass} value={params.qiraat ?? ''} onChange={(e) => update('qiraat', e.target.value)}>
            <option value="">{t.filters.allQiraat}</option>
            {qiraat.map((q) => (
              <option key={q.id} value={q.id}>
                {q.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-riwayat">{t.filters.riwayat}</Label>
          <select id="f-riwayat" className={selectClass} value={params.riwayat ?? ''} onChange={(e) => update('riwayat', e.target.value)}>
            <option value="">{t.filters.allRiwayat}</option>
            {visibleRiwayat.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="f-institusi">{t.filters.institution}</Label>
          <select
            id="f-institusi"
            className={selectClass}
            value={params.institusi ?? ''}
            onChange={(e) => update('institusi', e.target.value)}
            disabled={institutions.length === 0}
          >
            <option value="">{institutions.length ? t.filters.allInstitutions : t.filters.noInstitutions}</option>
            {institutions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex min-h-9 items-center gap-3">
        {active ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              startTransition(() => router.push(directoryHref(basePath, { q: params.q }), { scroll: false }))
            }
          >
            <X aria-hidden />
            {t.filters.clear}
          </Button>
        ) : null}
        {pending ? (
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t.common.loading}
          </span>
        ) : null}
      </div>
    </div>
  );
}
