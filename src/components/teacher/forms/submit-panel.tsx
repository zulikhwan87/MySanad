'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Send, Undo2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CheckboxField, TextareaField } from '@/components/forms/fields';
import { submitProfileAction, withdrawSubmissionAction } from '@/lib/actions/teacher-actions';
import type { ActionResult } from '@/lib/validations/auth';

export function SubmitPanel({ missing, alreadySubmitted, teacherId }: { missing: string[]; alreadySubmitted: boolean; teacherId?: string }) {
  const router = useRouter();
  const [declared, setDeclared] = useState(false);
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function act(fn: () => Promise<ActionResult>) {
    startTransition(async () => {
      const res = await fn();
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  if (alreadySubmitted) {
    return (
      <div className="space-y-4">
        <Alert variant="success">Profil anda telah dihantar dan menunggu semakan pentadbir.</Alert>
        {result?.message ? <Alert variant={result.ok ? 'success' : 'destructive'}>{result.message}</Alert> : null}
        <Button variant="outline" disabled={pending} onClick={() => act(withdrawSubmissionAction)}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Undo2 aria-hidden />}
          Tarik balik untuk menyunting
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {missing.length ? (
        <Alert variant="destructive">Belum boleh dihantar. Lengkapkan: {missing.join(', ')}.</Alert>
      ) : null}
      {result?.message ? <Alert variant={result.ok ? 'success' : 'destructive'}>{result.message}</Alert> : null}
      <TextareaField
        id="submit-notes"
        label={teacherId ? 'Catatan semakan (pilihan)' : 'Catatan kepada pentadbir (pilihan)'}
        rows={3}
        maxLength={1000}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <CheckboxField
        id="declaration"
        label={
          teacherId
            ? 'Saya mengesahkan maklumat ini diberikan oleh guru (atau wakilnya) dan dimasukkan dengan kebenarannya.'
            : 'Saya mengesahkan maklumat ini benar dan tepat.'
        }
        description="Saya faham MySanad mendokumenkan dan menyemak maklumat, dan tidak mengisytiharkan kesahihan sanad atau mengeluarkan pentauliahan."
        checked={declared}
        onChange={(e) => setDeclared(e.target.checked)}
      />
      <Button disabled={pending || !declared || missing.length > 0} onClick={() => act(() => submitProfileAction(notes, teacherId))}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
        Hantar untuk pengesahan
      </Button>
    </div>
  );
}
