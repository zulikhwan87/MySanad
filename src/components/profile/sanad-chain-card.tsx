'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, GitBranch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DemoBadge } from '@/components/public/verification-badges';
import { cn } from '@/lib/utils';
import type { PublicSanadChain } from '@/types/public';
import { useI18n } from '@/lib/i18n/client';

function formatDate(iso: string | null, intl: string) {
  return iso ? new Date(iso).toLocaleDateString(intl, { day: 'numeric', month: 'long', year: 'numeric' }) : null;
}

/** A sanad record; click to reveal its full public details. */
export function SanadChainCard({ chain }: { chain: PublicSanadChain }) {
  const { t, intl } = useI18n();
  const [open, setOpen] = useState(false);
  const panelId = `sanad-${chain.id}`;
  const rows: Array<[string, React.ReactNode]> = [
    [t.sanadCard.code, chain.sanad_code],
    [t.sanadCard.qiraat, chain.qiraat],
    [t.sanadCard.riwayat, chain.riwayat],
    [t.sanadCard.tariq, chain.tariq],
    [t.sanadCard.method, chain.transmission_method],
    [
      t.sanadCard.teacher,
      <span key="t">
        {chain.immediate_teacher_name_rumi}
        {chain.immediate_teacher_name_arabic ? (
          <span lang="ar" className="arabic block">
            {chain.immediate_teacher_name_arabic}
          </span>
        ) : null}
      </span>,
    ],
    [t.sanadCard.date, formatDate(chain.ijazah_date, intl)],
    [t.sanadCard.place, chain.ijazah_location],
    [t.sanadCard.depth, chain.generation_depth],
    [t.sanadCard.reviewedAt, formatDate(chain.verified_at, intl)],
    [t.sanadCard.notes, chain.public_notes],
  ];

  return (
    <div className="rounded-2xl border bg-card shadow-soft">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-start justify-between gap-4 p-5 text-start"
      >
        <span className="flex gap-3">
          <GitBranch className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
          <span>
            <span className="block font-semibold text-forest-900">{chain.title}</span>
            <span className="block text-sm text-muted-foreground">
              {chain.riwayat}
              {chain.tariq ? ` · ${chain.tariq}` : ''}
            </span>
            {chain.riwayat_arabic ? (
              <span lang="ar" className="arabic block text-sm text-forest-700">
                {chain.riwayat_arabic}
              </span>
            ) : null}
            <span className="mt-2 flex flex-wrap gap-1.5">
              <Badge variant="gold">{chain.verification_status === 'published' ? t.sanadCard.statusPublished : t.sanadCard.statusReviewed}</Badge>
              {chain.is_demo_record ? <DemoBadge /> : null}
            </span>
          </span>
        </span>
        <ChevronDown className={cn('mt-1 size-5 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            id={panelId}
            key="panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <dl className="grid gap-x-6 gap-y-3 border-t px-5 py-4 text-sm sm:grid-cols-2">
              {rows
                .filter(([, v]) => v !== null && v !== undefined && v !== '')
                .map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{k}</dt>
                    <dd className="text-forest-900">{v}</dd>
                  </div>
                ))}
            </dl>
            <p className="border-t px-5 py-3 text-sm">
              <Link href={`/sanad/${chain.id}`} className="font-medium text-primary hover:underline">
                {t.sanadCard.viewGraph}
              </Link>
            </p>
            <p className="border-t px-5 py-3 text-xs text-muted-foreground">
              {t.sanadCard.disclaimer}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
