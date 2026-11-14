'use client';

import { Building2, GitBranch, MapPinned, Users } from 'lucide-react';
import type { PlatformStats } from '@/types/public';
import { useI18n } from '@/lib/i18n/client';
import { fmt } from '@/lib/i18n/dictionaries';

export function StatsRow({ stats }: { stats: PlatformStats }) {
  const { t, intl } = useI18n();
  const items = [
    { icon: Users, value: stats.teachers, label: t.home.statTeachers },
    { icon: GitBranch, value: stats.sanad_chains, label: t.home.statChains },
    { icon: MapPinned, value: stats.states_with_teachers, label: t.home.statStates },
    { icon: Building2, value: stats.institutions, label: t.home.statInstitutions },
  ];
  return (
    <div>
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {items.map(({ icon: Icon, value, label }) => (
          <div key={label} className="rounded-2xl border bg-card p-4 shadow-soft">
            <Icon className="size-5 text-emerald-600" aria-hidden />
            <dd className="mt-2 text-2xl font-bold tabular-nums text-forest-900">{value.toLocaleString(intl)}</dd>
            <dt className="text-sm text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-muted-foreground">
        {t.home.statsNote}
        {stats.demo_teachers > 0 ? ` ${fmt(t.home.statsDemo, { n: stats.demo_teachers })}` : ''}
      </p>
    </div>
  );
}
