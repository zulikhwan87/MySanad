'use client';

import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/client';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="container flex flex-col items-center gap-3 py-20 text-center">
      <AlertTriangle className="size-10 text-gold-600" aria-hidden />
      <h1 className="text-xl font-semibold text-forest-900">{t.errors.errorTitle}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t.errors.errorBody}</p>
      {error.digest ? <p className="text-xs text-muted-foreground">{t.errors.reference}: {error.digest}</p> : null}
      <Button onClick={reset}>{t.common.retry}</Button>
    </div>
  );
}
