'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { Loader2, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { FormField } from './form-field';
import { useActionForm } from './use-action-form';
import { signUpAction } from '@/lib/actions/auth-actions';
import { RegisterSchema, type RegisterInput } from '@/lib/validations/auth';
import { useI18n } from '@/lib/i18n/client';

export function RegisterForm() {
  const { t } = useI18n();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<RegisterInput>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: { full_name: '', email: '', password: '', confirm_password: '' },
  });
  const { pending, result, run } = useActionForm(setError);

  if (result?.ok) {
    return (
      <Alert variant="success" className="flex gap-3">
        <MailCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
        <span>{result.message}</span>
      </Alert>
    );
  }

  return (
    <form noValidate onSubmit={handleSubmit((values) => run(() => signUpAction(values)))} className="space-y-4">
      {result?.message ? <Alert variant="destructive">{result.message}</Alert> : null}
      <FormField id="full_name" label={t.auth.fullName} autoComplete="name" error={errors.full_name?.message} {...register('full_name')} />
      <FormField id="email" label={t.auth.email} type="email" autoComplete="email" error={errors.email?.message} {...register('email')} />
      <FormField
        id="password"
        label={t.auth.password}
        type="password"
        autoComplete="new-password"
        hint={t.auth.passwordHint}
        error={errors.password?.message}
        {...register('password')}
      />
      <FormField
        id="confirm_password"
        label={t.auth.confirmPassword}
        type="password"
        autoComplete="new-password"
        error={errors.confirm_password?.message}
        {...register('confirm_password')}
      />
      <div className="space-y-1">
        <label htmlFor="accept_terms" className="flex items-start gap-2 text-sm">
          <input
            id="accept_terms"
            type="checkbox"
            aria-invalid={Boolean(errors.accept_terms)}
            aria-describedby={errors.accept_terms ? 'accept_terms-error' : undefined}
            className="mt-0.5 size-4 accent-[hsl(var(--primary))]"
            {...register('accept_terms')}
          />
          <span>
            {t.auth.agreePrefix}{' '}
            <Link href="/terms" className="text-primary underline" target="_blank">
              {t.footer.terms}
            </Link>{' '}
            {t.auth.agreeAnd}{' '}
            <Link href="/privacy" className="text-primary underline" target="_blank">
              {t.footer.privacy}
            </Link>
            .
          </span>
        </label>
        {errors.accept_terms?.message ? (
          <p id="accept_terms-error" className="text-xs font-medium text-destructive">
            {errors.accept_terms.message}
          </p>
        ) : null}
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
        {t.auth.submitRegister}
      </Button>
    </form>
  );
}
