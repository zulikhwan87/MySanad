'use client';

import { useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { SanadGraphLazy } from '@/components/sanad/sanad-graph-lazy';
import { ItemStatusButtons } from './item-status-buttons';
import type { SanadGraphData } from '@/lib/sanad/graph';

/** Private-mode graph for reviewers, with per-node / per-edge decisions in the details panel. */
export function AdminSanadReview({ graph, title, editable }: { graph: SanadGraphData; title: string; editable: boolean }) {
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const onDone = (text: string, ok: boolean) => setMessage({ text, ok });
  return (
    <div className="space-y-3">
      {message ? <Alert variant={message.ok ? 'success' : 'destructive'}>{message.text}</Alert> : null}
      <SanadGraphLazy
        data={graph}
        mode="private"
        title={title}
        allowExport
        renderNodeActions={(n) =>
          editable && !n.is_self ? (
            <div className="border-t pt-3">
              <p className="mb-1 text-xs text-muted-foreground">Keputusan perawi</p>
              <ItemStatusButtons table="sanad_nodes" id={n.id} label={n.full_name_rumi} onDone={onDone} />
            </div>
          ) : null
        }
        renderEdgeActions={(e) =>
          editable ? (
            <div className="border-t pt-3">
              <p className="mb-1 text-xs text-muted-foreground">Keputusan hubungan</p>
              <ItemStatusButtons table="sanad_edges" id={e.id} label="hubungan ini" onDone={onDone} />
            </div>
          ) : null
        }
      />
    </div>
  );
}
