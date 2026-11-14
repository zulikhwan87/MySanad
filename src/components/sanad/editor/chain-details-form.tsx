'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ChainFields } from './chain-fields';
import { updateSanadChainAction } from '@/lib/actions/sanad-actions';
import { SanadChainSchema, type SanadChainInput } from '@/lib/validations/sanad';
import { issuesByPath } from '@/lib/validations/issues';
import type { ActionResult } from '@/lib/validations/auth';
import type { TeacherReferenceData } from '@/types/teacher';

export function ChainDetailsForm({ chainId, initial, reference }: { chainId: string; initial: SanadChainInput; reference: TeacherReferenceData }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const parsed = SanadChainSchema.safeParse(value);
        if (!parsed.success) return setErrors(issuesByPath(parsed.error));
        setErrors({});
        startTransition(async () => {
          const res = await updateSanadChainAction(chainId, value);
          setResult(res);
          if (res.ok) router.refresh();
        });
      }}
    >
      {result?.message ? <Alert variant={result.ok ? 'success' : 'destructive'}>{result.message}</Alert> : null}
      <ChainFields value={value} onChange={setValue} errors={errors} reference={reference} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Simpan maklumat
        </Button>
      </div>
    </form>
  );
}
