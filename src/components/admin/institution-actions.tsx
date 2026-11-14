'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, ArchiveRestore, BadgeCheck, BadgeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { updateInstitutionAction } from '@/lib/actions/admin-actions';

export function InstitutionActions({ id, verified, archived, name }: { id: string; verified: boolean; archived: boolean; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (changes: { is_verified?: boolean; is_archived?: boolean }) =>
    startTransition(async () => {
      const res = await updateInstitutionAction({ id, ...changes });
      if (res.ok) router.refresh();
      else window.alert(res.message);
    });
  return (
    <span className="flex gap-1">
      {!archived ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run({ is_verified: !verified })} aria-label={`${verified ? 'Batal sahkan' : 'Sahkan'} ${name}`}>
          {verified ? <BadgeX aria-hidden /> : <BadgeCheck aria-hidden />} {verified ? 'Batal sah' : 'Sahkan'}
        </Button>
      ) : null}
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run({ is_archived: !archived })} aria-label={`${archived ? 'Pulihkan' : 'Arkib'} ${name}`}>
        {archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />} {archived ? 'Pulihkan' : 'Arkib'}
      </Button>
    </span>
  );
}
