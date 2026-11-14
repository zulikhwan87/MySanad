'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { setItemStatusAction } from '@/lib/actions/admin-actions';
import type { ITEM_TABLES } from '@/lib/validations/admin';

type Table = (typeof ITEM_TABLES)[number];

/** Per-item decisions (education, ijazah, contact, node, edge). */
export function ItemStatusButtons({ table, id, label, onDone }: { table: Table; id: string; label: string; onDone?: (message: string, ok: boolean) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const set = (status: 'approved' | 'revision_required' | 'rejected') =>
    startTransition(async () => {
      const res = await setItemStatusAction({ table, id, status });
      onDone?.(res.message ?? '', res.ok);
      if (res.ok) router.refresh();
      else if (!onDone) window.alert(res.message);
    });
  return (
    <div className="flex gap-1" role="group" aria-label={`Keputusan untuk ${label}`}>
      <Button size="icon" variant="ghost" disabled={pending} aria-label={`Luluskan ${label}`} title="Luluskan" onClick={() => set('approved')}>
        <Check aria-hidden />
      </Button>
      {table !== 'public_contact_channels' ? (
        <Button size="icon" variant="ghost" disabled={pending} aria-label={`Minta pembetulan ${label}`} title="Minta pembetulan" onClick={() => set('revision_required')}>
          <RotateCcw aria-hidden />
        </Button>
      ) : null}
      <Button size="icon" variant="ghost" disabled={pending} aria-label={`Tolak ${label}`} title="Tolak" onClick={() => set('rejected')}>
        <X aria-hidden />
      </Button>
    </div>
  );
}
