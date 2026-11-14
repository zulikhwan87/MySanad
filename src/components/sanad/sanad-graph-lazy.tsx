'use client';

import dynamic from 'next/dynamic';
import type { SanadGraphProps } from './sanad-graph';
import { useI18n } from '@/lib/i18n/client';

function GraphLoading() {
  const { t } = useI18n();
  return (
    <div className="flex h-[560px] items-center justify-center rounded-2xl border bg-secondary/30 text-sm text-muted-foreground" aria-busy="true">
      {t.graph.loading}
    </div>
  );
}

/** React Flow is client-only and sizeable; load it on demand. */
export const SanadGraphLazy = dynamic<SanadGraphProps>(() => import('./sanad-graph').then((m) => m.SanadGraph), {
  ssr: false,
  loading: () => <GraphLoading />,
});
