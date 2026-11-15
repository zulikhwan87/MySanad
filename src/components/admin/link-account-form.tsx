'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Link2, Loader2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/forms/fields';
import { linkTeacherAccountAction } from '@/lib/actions/teacher-actions';
import type { ActionResult } from '@/lib/validations/auth';

/** Attach an administrator-managed profile to an account the teacher (or a family member) registered. */
export function LinkAccountForm({ teacherId }: { teacherId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<(ActionResult & { fieldErrors?: Record<string, string[] | undefined> }) | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!window.confirm(`Pautkan profil ini kepada akaun ${email}? Pemilik akaun akan dapat mengurus profil ini sendiri.`)) return;
        startTransition(async () => {
          const res = await linkTeacherAccountAction(teacherId, email);
          setResult(res);
          if (res.ok) router.refresh();
        });
      }}
    >
      {result?.message ? <Alert variant={result.ok ? 'success' : 'destructive'}>{result.message}</Alert> : null}
      <TextField
        id="link-email"
        label="Emel akaun guru atau ahli keluarga"
        type="email"
        hint="Akaun mesti sudah didaftar melalui /register dan emelnya disahkan."
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={result?.fieldErrors?.email?.[0]}
      />
      <Button type="submit" variant="outline" disabled={pending || !email.trim()}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Link2 aria-hidden />}
        Pautkan kepada akaun
      </Button>
    </form>
  );
}
