'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { StatusBadge } from './status-badge';
import { cancelChangeRequestAction } from '@/lib/actions/teacher-actions';
import type { ActionResult } from '@/lib/validations/auth';
import type { ChangeRequestRecord } from '@/types/teacher';

const FIELD_LABELS: Record<string, string> = {
  full_name_rumi: 'Nama penuh',
  full_name_arabic: 'Nama Arab',
  public_display_name: 'Nama paparan',
  alternative_spellings: 'Ejaan alternatif',
  professional_title: 'Gelaran',
  gender: 'Jantina',
  teaching_state_id: 'Negeri mengajar',
  teaching_district_id: 'Daerah mengajar',
  primary_institution_id: 'Institusi',
  photo_url: 'Foto profil',
  short_bio: 'Biografi ringkas',
  full_biography: 'Biografi penuh',
  teaching_experience_years: 'Pengalaman',
  specializations: 'Pengkhususan',
  primary_qiraat_id: 'Qiraat utama',
  primary_riwayat_id: 'Riwayat utama',
};

export function ChangeRequestList({ items }: { items: ChangeRequestRecord[] }) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  if (!items.length) return <p className="text-sm text-muted-foreground">Tiada permohonan perubahan.</p>;

  return (
    <div className="space-y-3">
      {result?.message ? <Alert variant={result.ok ? 'success' : 'destructive'}>{result.message}</Alert> : null}
      <ul className="space-y-3">
        {items.map((c) => (
          <li key={c.id} className="space-y-2 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-forest-900">
                {new Date(c.created_at).toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
              <StatusBadge status={c.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              Medan: {Object.keys(c.proposed_changes).map((k) => FIELD_LABELS[k] ?? k).join(', ')}
            </p>
            {c.decision_summary ? <p className="text-sm">Ulasan pentadbir: {c.decision_summary}</p> : null}
            {c.status === 'submitted' ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const res = await cancelChangeRequestAction(c.id);
                    setResult(res);
                    if (res.ok) router.refresh();
                  })
                }
              >
                Batalkan permohonan
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
