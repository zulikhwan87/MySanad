import Link from 'next/link';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { WIZARD_STEPS } from '@/lib/teacher/status';

export function WizardStepper({ current, reached }: { current: number; reached: number }) {
  return (
    <nav aria-label="Langkah pendaftaran">
      <ol className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:grid-cols-7">
        {WIZARD_STEPS.map((s) => {
          const done = s.step === 1 || s.step < reached;
          const isCurrent = s.step === current;
          const reachable = s.step > 1 && s.step <= reached;
          const body = (
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                  done && !isCurrent && 'border-emerald-600 bg-emerald-50 text-emerald-700',
                  isCurrent && 'border-primary bg-primary text-primary-foreground',
                )}
              >
                {done && !isCurrent ? <Check className="size-3.5" aria-hidden /> : s.step}
              </span>
              <span className="whitespace-nowrap text-xs font-medium lg:whitespace-normal">{s.title}</span>
            </span>
          );
          return (
            <li key={s.step} className="min-w-fit">
              {reachable && !isCurrent ? (
                <Link href={`/teacher/register?langkah=${s.step}`} className="block rounded-lg p-1.5 hover:bg-secondary">
                  {body}
                </Link>
              ) : (
                <span aria-current={isCurrent ? 'step' : undefined} className={cn('block rounded-lg p-1.5', !reachable && !isCurrent && 'opacity-50')}>
                  {body}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
