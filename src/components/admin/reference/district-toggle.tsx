'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { setDistrictActiveAction } from '@/lib/actions/reference-actions';

export function DistrictToggle({ id, active, name }: { id: string; active: boolean; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      aria-label={`${active ? 'Nyahaktif' : 'Aktifkan'} ${name}`}
      onClick={() =>
        startTransition(async () => {
          const res = await setDistrictActiveAction(id, !active);
          if (res.ok) router.refresh();
          else window.alert(res.message);
        })
      }
    >
      {active ? 'Nyahaktif' : 'Aktifkan'}
    </Button>
  );
}
