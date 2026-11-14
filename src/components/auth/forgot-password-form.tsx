'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { FormField } from './form-field';
import { useActionForm } from './use-action-form';
import { requestPasswordResetAction } from '@/lib/actions/auth-actions';
import { ForgotPasswordSchema, type ForgotPasswordInput } from '@/lib/validations/auth';
import { useI18n } from '@/lib/i18n/client';

export function ForgotPasswordForm() {
  const { t } = useI18n();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(ForgotPasswordSchema), defaultValues: { email: '' } });
  const { pending, result, run } = useActionForm(setError);

  if (result?.ok) return <Alert variant="success">{result.message}</Alert>;

  return (
    <form noValidate onSubmit={handleSubmit((values) => run(() => requestPasswordResetAction(values)))} className="space-y-4">
      {result?.message ? <Alert variant="destructive">{result.message}</Alert> : null}
      <FormField id="email" label={t.auth.email} type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {t.auth.submitForgot}
      </Button>
    </form>
  );
}
