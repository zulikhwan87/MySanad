'use client';

import { useMemo, useState, useTransition } from 'react';
import { Loader2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/forms/fields';
import { attachReferenceChainAction } from '@/lib/actions/sanad-actions';
import type { ActionResult } from '@/lib/validations/auth';
import type { ActiveReference } from '@/lib/data/reference-chains';

/** The chosen perawi and everyone above it in the reference, nearest first. */
export function perawiFrom(ref: ActiveReference, fromId: string) {
  const keep = new Set([fromId]);
  const queue = [fromId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const l of ref.links) {
      if (l.target === current && !keep.has(l.source)) {
        keep.add(l.source);
        queue.push(l.source);
      }
    }
  }
  return ref.perawi.filter((p) => keep.has(p.id));
}

export function ReferenceAttachPanel({
  chainId,
  student,
  references,
  riwayatId,
  onDone,
  onCancel,
}: {
  chainId: string;
  student: { id: string; name: string };
  references: ActiveReference[];
  riwayatId?: string | null;
  onDone: (res: ActionResult) => void;
  onCancel: () => void;
}) {
  const sorted = useMemo(
    () => [...references].sort((a, b) => Number(b.riwayat_id === riwayatId) - Number(a.riwayat_id === riwayatId)),
    [references, riwayatId],
  );
  const [refId, setRefId] = useState(sorted[0]?.id ?? '');
  const [fromId, setFromId] = useState('');
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const ref = sorted.find((r) => r.id === refId);
  const preview = ref && fromId ? perawiFrom(ref, fromId) : [];

  return (
    <section className="space-y-4 rounded-2xl border-2 border-primary/30 bg-card p-5 shadow-soft" aria-label="Sambung dengan rantaian rujukan">
      <h3 className="font-semibold text-forest-900">Sambung {student.name} dengan rantaian rujukan</h3>
      <p className="text-sm text-muted-foreground">
        Pilih perawi dalam rantaian rujukan yang menjadi guru kepada {student.name}. Perawi itu dan semua di atasnya akan disalin ke dalam
        rantaian anda sebagai draf, dan disemak oleh pentadbir apabila anda menghantar.
      </p>
      {result && !result.ok ? <Alert variant="destructive">{result.message}</Alert> : null}
      <SelectField
        id="ref-chain"
        label="Rantaian rujukan"
        required
        options={sorted.map((r) => ({ value: r.id, label: [r.title, r.riwayat === null ? null : r.riwayat_id === riwayatId ? 'riwayat sama' : r.riwayat].filter(Boolean).join(' · ') }))}
        value={refId}
        onChange={(e) => {
          setRefId(e.target.value);
          setFromId('');
        }}
      />
      <SelectField
        id="ref-from"
        label={`Guru kepada ${student.name}`}
        required
        disabled={!ref}
        options={(ref?.perawi ?? []).filter((p) => p.id !== student.id).map((p, i) => ({ value: p.id, label: `${i + 1}. ${p.name}` }))}
        value={fromId}
        onChange={(e) => setFromId(e.target.value)}
      />
      {preview.length ? (
        <div className="rounded-xl border bg-secondary/40 p-3">
          <p className="mb-2 text-sm font-medium text-forest-900">Akan disalin ({preview.length} perawi):</p>
          <ol className="space-y-0.5 text-sm">
            <li className="text-muted-foreground">↓ {student.name}</li>
            {preview.map((p) => (
              <li key={p.id}>
                ↑ {p.name}
                {p.arabic ? (
                  <span lang="ar" dir="rtl" className="arabic ms-2 text-forest-700">
                    {p.arabic}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button variant="ghost" onClick={onCancel}>
          Batal
        </Button>
        <Button
          disabled={pending || !refId || !fromId}
          onClick={() =>
            startTransition(async () => {
              const res = await attachReferenceChainAction(chainId, student.id, refId, fromId);
              setResult(res);
              if (res.ok) onDone(res);
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null} Salin ke rantaian saya
        </Button>
      </div>
    </section>
  );
}
