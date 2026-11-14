'use client';

import { useState } from 'react';
import { Download, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { openSigned } from '@/components/documents/document-list';

export function DocumentButtons({ id, name }: { id: string; name: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-1">
      <Button size="icon" variant="ghost" aria-label={`Lihat ${name}`} onClick={async () => setError(await openSigned(id, false))}>
        <Eye aria-hidden />
      </Button>
      <Button size="icon" variant="ghost" aria-label={`Muat turun ${name}`} onClick={async () => setError(await openSigned(id, true))}>
        <Download aria-hidden />
      </Button>
      {error ? <span className="text-xs text-destructive">{error}</span> : null}
    </span>
  );
}
