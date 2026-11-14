'use client';

import { Database, SearchX } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { useI18n } from '@/lib/i18n/client';

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <Card className="border-dashed shadow-none">
      <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
        <SearchX className="size-8 text-muted-foreground" aria-hidden />
        <p className="font-semibold text-forest-900">{title}</p>
        {children ? <div className="max-w-md text-sm text-muted-foreground">{children}</div> : null}
      </CardContent>
    </Card>
  );
}

export function NotConfigured() {
  const { t } = useI18n();
  return (
    <Card className="border-dashed shadow-none">
      <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
        <Database className="size-8 text-muted-foreground" aria-hidden />
        <p className="font-semibold text-forest-900">{t.common.notConfiguredTitle}</p>
        <p className="max-w-md text-sm text-muted-foreground">{t.common.notConfiguredBody}</p>
      </CardContent>
    </Card>
  );
}
