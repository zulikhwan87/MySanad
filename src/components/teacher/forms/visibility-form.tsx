'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckboxField } from '@/components/forms/fields';
import { useActionForm } from '@/components/auth/use-action-form';
import { FormMessage, SubmitRow } from './form-shell';
import { saveVisibilityAction } from '@/lib/actions/teacher-actions';
import { VisibilityStepSchema, type VisibilityStepInput } from '@/lib/validations/teacher';
import type { TeacherSettings } from '@/types/teacher';

const OPTIONS: Array<{ key: keyof TeacherSettings; label: string; description: string }> = [
  { key: 'show_photo', label: 'Papar foto profil', description: 'Foto dipaparkan pada kad dan profil awam.' },
  { key: 'show_institution', label: 'Papar institusi', description: 'Nama institusi utama anda.' },
  { key: 'show_education', label: 'Papar pendidikan', description: 'Rekod pendidikan yang telah disemak.' },
  { key: 'show_ijazah_dates', label: 'Papar tarikh ijazah', description: 'Jika dimatikan, hanya tahun/tarikh disembunyikan.' },
  { key: 'show_sanad_graph', label: 'Papar graf sanad', description: 'Graf interaktif rantaian sanad yang telah disemak.' },
  { key: 'allow_graph_download', label: 'Benarkan muat turun graf', description: 'Pelawat boleh mengeksport graf sanad anda.' },
  { key: 'show_public_contact', label: 'Papar saluran hubungan rasmi', description: 'Saluran yang telah diluluskan sahaja.' },
  { key: 'accepting_students', label: 'Menerima pelajar baharu', description: 'Dipaparkan sebagai lencana pada profil.' },
];

export function VisibilityForm({ settings, nextHref, submitLabel = 'Simpan' }: { settings: TeacherSettings; nextHref?: string; submitLabel?: string }) {
  const router = useRouter();
  const { register, handleSubmit, setError } = useForm<VisibilityStepInput>({
    resolver: zodResolver(VisibilityStepSchema),
    defaultValues: settings,
  });
  const { pending, result, run } = useActionForm(setError);

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((values) =>
        run(async () => {
          const res = await saveVisibilityAction(values);
          if (res.ok) {
            if (nextHref) router.push(nextHref);
            else router.refresh();
          }
          return res;
        }),
      )}
    >
      <FormMessage result={result} />
      <p className="text-sm text-muted-foreground">
        Tetapan ini berkuat kuasa serta-merta, termasuk selepas profil diterbitkan. Maklumat peribadi (MyKad, telefon, alamat) tidak
        pernah dipaparkan.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((o) => (
          <CheckboxField key={o.key} id={`vis-${o.key}`} label={o.label} description={o.description} {...register(o.key)} />
        ))}
      </div>
      <SubmitRow pending={pending} label={submitLabel} />
    </form>
  );
}
