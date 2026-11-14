'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { FormField } from './form-field';
import { useActionForm } from './use-action-form';
import { signInAction } from '@/lib/actions/auth-actions';
import { LoginSchema, type LoginInput } from '@/lib/validations/auth';
import { useI18n } from '@/lib/i18n/client';

export function LoginForm({ next }: { next?: string }) {
  const { t } = useI18n();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(LoginSchema), defaultValues: { email: '', password: '' } });
  const { pending, result, run } = useActionForm(setError);

  return (
    <form noValidate onSubmit={handleSubmit((values) => run(() => signInAction(values, next)))} className="space-y-4">
      {result?.message ? <Alert variant={result.ok ? 'success' : 'destructive'}>{result.message}</Alert> : null}
      <FormField id="email" label={t.auth.email} type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
      <FormField
        id="password"
        label={t.auth.password}
        type="password"
        autoComplete="current-password"
        error={errors.password?.message}
        {...register('password')}
      />
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {t.auth.submitLogin}
      </Button>
    </form>
  );
}
