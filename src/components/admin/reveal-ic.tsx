'use client';

import { useState, useTransition } from 'react';
import { Eye, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { revealIcAction } from '@/lib/actions/admin-actions';

/** Shows the full MyKad only after a stated reason; the database writes an audit entry first. */
export function RevealIc({ teacherId, masked }: { teacherId: string; masked: string | null }) {
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!masked) return <span className="text-muted-foreground">Tiada</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-mono">{value ?? masked}</span>
      {value ? (
        <Button size="sm" variant="ghost" onClick={() => setValue(null)}>
          Sembunyi
        </Button>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            const reason = window.prompt('Sebab paparan No. MyKad (direkod dalam log audit):');
            if (!reason) return;
            startTransition(async () => {
              const res = await revealIcAction({ teacher_id: teacherId, reason });
              if (res.ok && res.value) {
                setValue(res.value);
                setError(null);
              } else setError(res.message ?? 'Gagal.');
            });
          }}
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Eye aria-hidden />} Papar penuh
        </Button>
      )}
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </span>
  );
}
