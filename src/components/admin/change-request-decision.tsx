'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, X } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextareaField } from '@/components/forms/fields';
import { decideChangeRequestAction } from '@/lib/actions/admin-actions';
import type { ActionResult } from '@/lib/validations/auth';

export function ChangeRequestDecision({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState('');
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const decide = (approve: boolean) =>
    startTransition(async () => {
      const res = await decideChangeRequestAction({ request_id: requestId, approve, feedback });
      setResult(res);
      if (res.ok) router.refresh();
    });
  return (
    <div className="space-y-3">
      {result?.message ? <Alert variant={result.ok ? 'success' : 'destructive'}>{result.message}</Alert> : null}
      <TextareaField id="cr-feedback" label="Ulasan kepada guru" hint="Wajib jika ditolak." rows={3} maxLength={2000} value={feedback} onChange={(e) => setFeedback(e.target.value)} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="destructive" disabled={pending || !feedback.trim()} onClick={() => decide(false)}>
          <X aria-hidden /> Tolak
        </Button>
        <Button disabled={pending} onClick={() => window.confirm('Luluskan dan paparkan perubahan ini kepada umum?') && decide(true)}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />} Luluskan perubahan
        </Button>
      </div>
    </div>
  );
}
