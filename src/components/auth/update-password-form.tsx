'use client';

import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { FormField } from './form-field';
import { useActionForm } from './use-action-form';
import { updatePasswordAction } from '@/lib/actions/auth-actions';
import { UpdatePasswordSchema, type UpdatePasswordInput } from '@/lib/validations/auth';

export function UpdatePasswordForm() {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<UpdatePasswordInput>({
    resolver: zodResolver(UpdatePasswordSchema),
    defaultValues: { password: '', confirm_password: '' },
  });
  const { pending, result, run } = useActionForm(setError);

  if (result?.ok) {
    return (
      <div className="space-y-4">
        <Alert variant="success">{result.message}</Alert>
        <Button asChild className="w-full">
          <Link href="/teacher/dashboard">Ke Portal Guru</Link>
        </Button>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit((values) => run(() => updatePasswordAction(values)))} className="space-y-4">
      {result?.message ? <Alert variant="destructive">{result.message}</Alert> : null}
      <FormField
        id="password"
        label="Kata laluan baharu"
        type="password"
        autoComplete="new-password"
        hint="Sekurang-kurangnya 10 aksara, mengandungi huruf dan nombor."
        error={errors.password?.message}
        {...register('password')}
      />
      <FormField
        id="confirm_password"
        label="Sahkan kata laluan baharu"
        type="password"
        autoComplete="new-password"
        error={errors.confirm_password?.message}
        {...register('confirm_password')}
      />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        Simpan Kata Laluan
      </Button>
    </form>
  );
}
