'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { GitPullRequest, Loader2, Send, Trash2, Undo2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextareaField } from '@/components/forms/fields';
import { StatusBadge } from '@/components/teacher/status-badge';
import { deleteSanadChainAction, reviseSanadChainAction, submitSanadChainAction, withdrawSanadChainAction } from '@/lib/actions/sanad-actions';
import type { ActionResult } from '@/lib/validations/auth';
import type { VerificationStatus } from '@/types/mysanad';

const REASON_LABELS: Record<string, string> = {
  submitted: 'Dihantar untuk semakan',
  withdrawn: 'Ditarik balik',
  revision_started: 'Semakan baharu dimulakan',
};

export function ChainStatusPanel({
  chainId,
  status,
  feedback,
  revisions,
  supersedes,
  basePath = '/teacher/sanad',
}: {
  chainId: string;
  /** Where the chain pages live (teacher portal or admin editing). */
  basePath?: string;
  status: VerificationStatus;
  feedback: string | null;
  revisions: Array<{ id: string; revision_no: number; reason: string; created_at: string }>;
  supersedes: string | null;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function act(fn: () => Promise<ActionResult & { id?: string }>, after?: (id?: string) => void) {
    startTransition(async () => {
      const res = await fn();
      setResult(res);
      if (res.ok) {
        if (after) after(res.id);
        else router.refresh();
      }
    });
  }

  const editable = status === 'draft' || status === 'revision_required';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">Status:</span>
        <StatusBadge status={status} />
        {supersedes ? <span className="text-xs text-muted-foreground">Semakan kepada rantaian terdahulu</span> : null}
      </div>
      {feedback && (status === 'revision_required' || status === 'rejected') ? (
        <Alert variant="destructive">
          <p className="font-semibold">Ulasan pentadbir</p>
          <p className="whitespace-pre-line">{feedback}</p>
        </Alert>
      ) : null}
      {result?.message ? <Alert variant={result.ok ? 'success' : 'destructive'}>{result.message}</Alert> : null}

      {editable ? (
        <div className="space-y-3">
          <TextareaField id="chain-notes" label="Catatan kepada pentadbir (pilihan)" rows={2} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending} onClick={() => act(() => submitSanadChainAction(chainId, notes))}>
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
              Hantar untuk semakan
            </Button>
            {status === 'draft' ? (
              <Button
                variant="ghost"
                disabled={pending}
                onClick={() =>
                  window.confirm('Padam rantaian draf ini? Tindakan ini tidak boleh dibatalkan.') &&
                  act(() => deleteSanadChainAction(chainId), () => router.push(basePath))
                }
              >
                <Trash2 aria-hidden /> Padam draf
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Sebelum dihantar, semua perawi mesti bersambung kepada anda. Selepas dihantar, rantaian dikunci sehingga diputuskan atau
            ditarik balik.
          </p>
        </div>
      ) : null}
      {status === 'submitted' ? (
        <Button variant="outline" disabled={pending} onClick={() => act(() => withdrawSanadChainAction(chainId))}>
          <Undo2 aria-hidden /> Tarik balik untuk menyunting
        </Button>
      ) : null}
      {status === 'approved' || status === 'published' ? (
        <Button variant="outline" disabled={pending} onClick={() => act(() => reviseSanadChainAction(chainId), (id) => id && router.push(`${basePath}/${id}`))}>
          <GitPullRequest aria-hidden /> Cipta semakan baharu
        </Button>
      ) : null}

      {revisions.length ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-forest-900">Sejarah semakan</h3>
          <ol className="space-y-1 text-sm">
            {revisions.map((r) => (
              <li key={r.id} className="flex justify-between gap-3">
                <span>
                  #{r.revision_no} · {REASON_LABELS[r.reason] ?? r.reason}
                </span>
                <span className="text-muted-foreground">
                  {new Date(r.created_at).toLocaleString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
