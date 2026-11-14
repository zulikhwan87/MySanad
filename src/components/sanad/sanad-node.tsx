'use client';

import { memo } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';
import type { GraphNodeData } from '@/lib/sanad/graph';

export type LabelMode = 'rumi' | 'arab' | 'both';

export type SanadFlowNode = Node<
  GraphNodeData & {
    labelMode: LabelMode;
    highlight: 'up' | 'down' | 'focus' | 'match' | null;
    dimmed: boolean;
    showStatus: boolean;
  } & Record<string, unknown>,
  'sanad'
>;

const STATUS_SHORT: Record<string, string> = {
  draft: 'Draf',
  submitted: 'Dihantar',
  under_review: 'Disemak',
  revision_required: 'Pembetulan',
  approved: 'Lulus',
  published: 'Terbit',
  rejected: 'Ditolak',
  suspended: 'Digantung',
};

function years(n: GraphNodeData) {
  if (n.death_year_hijri) return `w. ${n.death_year_hijri}`;
  if (n.death_year_miladi) return `w. ${n.death_year_miladi}M`;
  return null;
}

function SanadNodeView({ data, selected }: NodeProps<SanadFlowNode>) {
  const arabic = data.full_name_arabic;
  const showRumi = data.labelMode !== 'arab' || !arabic;
  const showArabic = data.labelMode !== 'rumi' && Boolean(arabic);
  const unapproved = data.showStatus && data.verification_status && !['approved', 'published'].includes(data.verification_status);

  return (
    <div
      className={cn(
        'w-[220px] rounded-xl border bg-card px-3 py-2 text-left shadow-soft transition-opacity motion-safe:duration-500 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95',
        data.is_self && 'border-2 border-gold-500 bg-gold-50',
        unapproved && 'border-dashed',
        data.highlight === 'up' && 'ring-2 ring-gold-400',
        data.highlight === 'down' && 'ring-2 ring-emerald-500',
        data.highlight === 'match' && 'ring-2 ring-sky-500',
        (data.highlight === 'focus' || selected) && 'ring-2 ring-primary ring-offset-2',
        data.dimmed && 'opacity-30',
      )}
    >
      <Handle type="target" position={Position.Top} className="!size-2 !border-0 !bg-forest-400" isConnectable={false} />
      {showRumi ? <p className="line-clamp-2 text-[13px] font-semibold leading-snug text-forest-900">{data.full_name_rumi}</p> : null}
      {showArabic ? (
        <p lang="ar" dir="rtl" className="arabic line-clamp-2 text-sm leading-snug text-forest-700">
          {arabic}
        </p>
      ) : null}
      <p className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate">{data.generation_category}</span>
        <span className="shrink-0">{data.showStatus && data.verification_status ? STATUS_SHORT[data.verification_status] : years(data)}</span>
      </p>
      <Handle type="source" position={Position.Bottom} className="!size-2 !border-0 !bg-forest-400" isConnectable={false} />
    </div>
  );
}

export const SanadNodeCard = memo(SanadNodeView);
