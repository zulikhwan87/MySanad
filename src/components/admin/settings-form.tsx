'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { CheckboxField, TextareaField, TextField } from '@/components/forms/fields';
import { saveSettingsAction } from '@/lib/actions/reference-actions';
import type { ActionResult } from '@/lib/validations/auth';
import type { SettingsInput } from '@/lib/validations/reference';

export function SettingsForm({ initial, editable }: { initial: SettingsInput; editable: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const err = (k: string) => result?.fieldErrors?.[k]?.[0];
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.registration_open && initial.registration_open && !window.confirm('Tutup pendaftaran akaun baharu? Sebarang pendaftaran akan ditolak oleh pangkalan data.')) return;
        startTransition(async () => {
          const res = await saveSettingsAction(v);
          setResult(res);
          if (res.ok) router.refresh();
        });
      }}
    >
      {result?.message ? <Alert variant={result.ok ? 'success' : 'destructive'}>{result.message}</Alert> : null}
      <fieldset disabled={!editable || pending} className="space-y-4">
        <CheckboxField
          id="s-reg"
          label="Pendaftaran akaun baharu dibuka"
          description="Jika ditutup, pangkalan data menolak semua akaun baharu (termasuk melalui API Supabase secara terus)."
          checked={Boolean(v.registration_open)}
          onChange={(e) => setV({ ...v, registration_open: e.target.checked })}
        />
        <TextareaField
          id="s-ann"
          label="Pengumuman (sepanduk di semua halaman)"
          hint={`${String(v.announcement ?? '').length}/300. Kosongkan untuk menyembunyikan.`}
          rows={2}
          maxLength={300}
          value={String(v.announcement ?? '')}
          error={err('announcement')}
          onChange={(e) => setV({ ...v, announcement: e.target.value })}
        />
        <TextField
          id="s-email"
          label="Emel hubungan rasmi"
          type="email"
          hint="Dipaparkan di halaman Hubungi Kami."
          value={String(v.contact_email ?? '')}
          error={err('contact_email')}
          onChange={(e) => setV({ ...v, contact_email: e.target.value })}
        />
        <TextField
          id="s-max"
          label="Had dokumen bagi setiap guru"
          type="number"
          min={1}
          max={200}
          className="max-w-xs"
          value={String(v.max_documents_per_teacher ?? '')}
          error={err('max_documents_per_teacher')}
          onChange={(e) => setV({ ...v, max_documents_per_teacher: Number(e.target.value) })}
        />
      </fieldset>
      {editable ? (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null} Simpan tetapan
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Hanya Super Admin boleh mengubah tetapan sistem.</p>
      )}
    </form>
  );
}
