import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { getT } from '@/lib/i18n/server';

export default function NotFound() {
  const t = getT();
  return (
    <div className="container flex flex-col items-center gap-3 py-20 text-center">
      <p className="text-5xl font-bold text-forest-200">404</p>
      <h1 className="text-xl font-semibold text-forest-900">{t.errors.notFoundTitle}</h1>
      <p className="max-w-md text-sm text-muted-foreground">{t.errors.notFoundBody}</p>
      <Button asChild>
        <Link href="/directory">{t.errors.notFoundCta}</Link>
      </Button>
    </div>
  );
}
