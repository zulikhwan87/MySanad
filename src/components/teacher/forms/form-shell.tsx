'use client';

import { Loader2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/lib/validations/auth';

export function FormMessage({ result }: { result: ActionResult | null }) {
  if (!result?.message) return null;
  return (
    <Alert variant={result.ok ? 'success' : 'destructive'} aria-live="polite">
      {result.message}
    </Alert>
  );
}

export function SubmitRow({ pending, label, secondary }: { pending: boolean; label: string; secondary?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <div>{secondary}</div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {label}
      </Button>
    </div>
  );
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-1 space-y-0.5">
        <span className="block font-semibold text-forest-900">{title}</span>
        {description ? <span className="block text-sm text-muted-foreground">{description}</span> : null}
      </legend>
      {children}
    </fieldset>
  );
}
