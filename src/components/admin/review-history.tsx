import { StatusBadge } from '@/components/teacher/status-badge';
import { fmtDate } from './labels';
import type { ReviewHistoryItem } from '@/lib/data/admin';

export function ReviewHistory({ reviews }: { reviews: ReviewHistoryItem[] }) {
  if (reviews.length === 0) return <p className="text-sm text-muted-foreground">Belum ada keputusan.</p>;
  return (
    <ol className="space-y-3">
      {reviews.map((r) => (
        <li key={r.id} className="space-y-1 rounded-xl border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={r.previous_status} /> → <StatusBadge status={r.new_status} />
            <span className="text-muted-foreground">
              {r.reviewer?.full_name} · {fmtDate(r.created_at, true)}
            </span>
          </div>
          {r.public_feedback ? <p>Ulasan kepada guru: {r.public_feedback}</p> : null}
          {r.internal_admin_comment ? <p className="text-gold-700">Catatan dalaman: {r.internal_admin_comment}</p> : null}
          {Object.keys(r.checklist_verified ?? {}).length ? (
            <p className="text-xs text-muted-foreground">
              Disemak: {Object.entries(r.checklist_verified).filter(([, v]) => v).map(([k]) => k).join(', ') || 'tiada'}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
