'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Languages } from 'lucide-react';
import { setLocaleAction } from '@/lib/actions/locale-actions';
import { LOCALES, LOCALE_NAMES, LOCALE_SHORT } from '@/lib/i18n/config';
import { useI18n } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

export function LanguageSwitcher() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div role="group" aria-label={t.nav.language} className="flex items-center gap-1 rounded-lg border p-0.5" aria-busy={pending}>
      <Languages className="ms-1 size-4 text-muted-foreground" aria-hidden />
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={locale === l}
          title={LOCALE_NAMES[l]}
          aria-label={LOCALE_NAMES[l]}
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await setLocaleAction(l);
              router.refresh();
            })
          }
          className={cn('rounded-md px-2 py-1 text-xs font-medium', locale === l ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary')}
        >
          {LOCALE_SHORT[l]}
        </button>
      ))}
    </div>
  );
}
