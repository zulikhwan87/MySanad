'use client';

import { useState, useTransition } from 'react';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import type { ActionResult } from '@/lib/validations/auth';

/** Runs a server action and maps its field errors back onto react-hook-form. */
export function useActionForm<T extends FieldValues>(setError: UseFormSetError<T>) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  function run(action: () => Promise<ActionResult | void>) {
    setResult(null);
    startTransition(async () => {
      try {
        const res = await action();
        if (!res) return; // redirected
        if (res.fieldErrors) {
          for (const [field, messages] of Object.entries(res.fieldErrors)) {
            if (messages?.[0]) setError(field as Path<T>, { type: 'server', message: messages[0] });
          }
        }
        setResult(res);
      } catch (error) {
        // A server-action redirect is handled by the Next.js router; nothing to show.
        if (error && typeof error === 'object' && 'digest' in error && String(error.digest).startsWith('NEXT_REDIRECT')) {
          return;
        }
        setResult({ ok: false, message: 'Ralat rangkaian. Sila cuba lagi.' });
      }
    });
  }

  return { pending, result, run };
}
