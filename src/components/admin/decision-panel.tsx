'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, PlayCircle } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CheckboxField, TextareaField } from '@/components/forms/fields';
import { decideSubmissionAction, startReviewAction } from '@/lib/actions/admin-actions';
import { CHECKLISTS, DECISION_LABELS, DECISIONS, type Decision } from '@/lib/validations/admin';
import type { ActionResult } from '@/lib/validations/auth';
import type { VerificationStatus } from '@/types/mysanad';
import { cn } from '@/lib/utils';

const CONFIRM: Partial<Record<Decision, string>> = {
  publish: 'Terbitkan rekod ini kepada umum?',
  reject: 'Tolak permohonan ini? Guru tidak boleh menghantar semula rekod yang ditolak.',
};

export function DecisionPanel({ submissionId, status, targetType }: { submissionId: string; status: VerificationStatus; targetType: string }) {
  const router = useRouter();
  const allowed: Decision[] = targetType === 'teacher_profile' ? [...DECISIONS] : DECISIONS.filter((d) => d !== 'publish');
  const [decision, setDecision] = useState<Decision | ''>('');
  const [feedback, setFeedback] = useState('');
  const [internal, setInternal] = useState('');
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const open = status === 'submitted' || status === 'under_review';
  const needsFeedback = decision === 'reject' || decision === 'revision_required';

  function run(fn: () => Promise<ActionResult>) {
    startTransition(async () => {
      const res = await fn();
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  if (!open) {
    return <Alert variant="info">Permohonan ini telah diputuskan. Lihat sejarah semakan di bawah.</Alert>;
  }

  return (
    <div className="space-y-4">
      {result?.message ? <Alert variant={result.ok ? 'success' : 'destructive'}>{result.message}</Alert> : null}
      {status === 'submitted' ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed p-3 text-sm">
          <span className="text-muted-foreground">Mulakan semakan untuk mengunci rekod daripada disunting oleh guru.</span>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => startReviewAction(submissionId))}>
            <PlayCircle aria-hidden /> Mula semak
          </Button>
        </div>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-forest-900">Senarai semak</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {(CHECKLISTS[targetType] ?? []).map((c) => (
            <CheckboxField
              key={c.key}
              id={`chk-${c.key}`}
              label={c.label}
              checked={Boolean(checklist[c.key])}
              onChange={(e) => setChecklist({ ...checklist, [c.key]: e.target.checked })}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-forest-900">Keputusan</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Keputusan">
          {allowed.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={decision === d}
              onClick={() => setDecision(d)}
              className={cn(
                'rounded-lg border px-3 py-2 text-sm font-medium',
                decision === d && (d === 'reject' ? 'border-destructive bg-red-50 text-red-800' : 'border-primary bg-secondary'),
              )}
            >
              {DECISION_LABELS[d]}
            </button>
          ))}
        </div>
      </fieldset>

      <TextareaField
        id="public-feedback"
        label={`Ulasan kepada guru${needsFeedback ? '' : ' (pilihan)'}`}
        required={needsFeedback}
        hint="Dipaparkan kepada guru dalam notifikasi dan sejarah pengesahan."
        rows={3}
        maxLength={2000}
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
      />
      <TextareaField
        id="internal-comment"
        label="Catatan dalaman (pentadbir sahaja)"
        hint="Tidak pernah dipaparkan kepada guru atau umum."
        rows={2}
        maxLength={4000}
        value={internal}
        onChange={(e) => setInternal(e.target.value)}
      />
      <div className="flex justify-end">
        <Button
          disabled={pending || !decision || (needsFeedback && !feedback.trim())}
          variant={decision === 'reject' ? 'destructive' : 'default'}
          onClick={() => {
            if (!decision) return;
            if (CONFIRM[decision] && !window.confirm(CONFIRM[decision])) return;
            run(() =>
              decideSubmissionAction({
                submission_id: submissionId,
                decision,
                public_feedback: feedback,
                internal_comment: internal,
                checklist,
              }),
            );
          }}
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Rekod keputusan
        </Button>
      </div>
    </div>
  );
}
