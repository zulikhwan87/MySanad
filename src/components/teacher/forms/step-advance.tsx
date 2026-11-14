'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { advanceOnboardingAction } from '@/lib/actions/teacher-actions';

/** "Continue" for steps whose rows are saved individually (education, ijazah). */
export function StepAdvance({ toStep, href, label = 'Teruskan' }: { toStep: number; href: string; label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-2 border-t pt-4">
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await advanceOnboardingAction(toStep);
            if (res.ok) router.push(href);
            else setError(res.message ?? 'Ralat.');
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {label}
      </Button>
    </div>
  );
}
