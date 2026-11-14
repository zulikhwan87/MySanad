'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CheckboxField, SelectField, TextField } from '@/components/forms/fields';
import { useActionForm } from '@/components/auth/use-action-form';
import { StatusBadge } from '@/components/teacher/status-badge';
import { FormMessage, SubmitRow } from './form-shell';
import { deleteEducationAction, saveEducationAction } from '@/lib/actions/teacher-actions';
import { EducationSchema, QUALIFICATION_LEVELS, type EducationInput } from '@/lib/validations/teacher';
import type { ActionResult } from '@/lib/validations/auth';
import type { EducationRecord } from '@/types/teacher';

function EducationForm({ record, onDone }: { record: EducationRecord | null; onDone: () => void }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<EducationInput>({
    resolver: zodResolver(EducationSchema),
    defaultValues: {
      institution_name: record?.institution_name ?? '',
      country: record?.country ?? 'Malaysia',
      qualification_level: (record?.qualification_level as EducationInput['qualification_level']) ?? undefined,
      field_of_study: record?.field_of_study ?? '',
      start_year: record?.start_year ?? undefined,
      graduation_year: record?.graduation_year ?? undefined,
      is_public: record?.is_public ?? true,
    },
  });
  const { pending, result, run } = useActionForm(setError);

  return (
    <form
      noValidate
      className="space-y-4 rounded-2xl border bg-secondary/40 p-4"
      onSubmit={handleSubmit((values) =>
        run(async () => {
          const res = await saveEducationAction(record?.id ?? null, values);
          if (res.ok) {
            onDone();
            router.refresh();
          }
          return res;
        }),
      )}
    >
      <FormMessage result={result} />
      {record && (record.verification_status === 'approved' || record.verification_status === 'published') ? (
        <p className="text-xs text-muted-foreground">Menyunting rekod yang telah disemak akan menghantarnya semula untuk semakan.</p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="edu-institution" label="Institusi" required error={errors.institution_name?.message} {...register('institution_name')} />
        <TextField id="edu-country" label="Negara" required error={errors.country?.message} {...register('country')} />
        <SelectField
          id="edu-level"
          label="Tahap kelayakan"
          required
          options={QUALIFICATION_LEVELS.map((l) => ({ value: l, label: l }))}
          error={errors.qualification_level?.message}
          {...register('qualification_level')}
        />
        <TextField id="edu-field" label="Bidang pengajian" required error={errors.field_of_study?.message} {...register('field_of_study')} />
        <TextField id="edu-start" label="Tahun mula" type="number" inputMode="numeric" error={errors.start_year?.message} {...register('start_year')} />
        <TextField id="edu-grad" label="Tahun tamat" type="number" inputMode="numeric" error={errors.graduation_year?.message} {...register('graduation_year')} />
      </div>
      <CheckboxField id="edu-public" label="Papar kepada umum" description="Dipaparkan hanya selepas disemak." {...register('is_public')} />
      <SubmitRow
        pending={pending}
        label={record ? 'Simpan perubahan' : 'Tambah rekod'}
        secondary={
          <Button type="button" variant="ghost" onClick={onDone}>
            Batal
          </Button>
        }
      />
    </form>
  );
}

export function EducationManager({ items }: { items: EducationRecord[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | 'new' | null>(items.length === 0 ? 'new' : null);
  const [message, setMessage] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function remove(id: string) {
    if (!window.confirm('Padam rekod pendidikan ini?')) return;
    startTransition(async () => {
      const res = await deleteEducationAction(id);
      setMessage(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <FormMessage result={message} />
      {items.length === 0 && editing !== 'new' ? <p className="text-sm text-muted-foreground">Belum ada rekod pendidikan.</p> : null}
      <ul className="space-y-3">
        {items.map((e) =>
          editing === e.id ? (
            <li key={e.id}>
              <EducationForm record={e} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={e.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-4">
              <div>
                <p className="font-medium text-forest-900">
                  {e.qualification_level} · {e.field_of_study}
                </p>
                <p className="text-sm text-muted-foreground">
                  {e.institution_name}, {e.country}
                  {e.graduation_year ? ` (${e.graduation_year})` : ''}
                  {!e.is_public ? ' · tidak dipaparkan' : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={e.verification_status} />
                <Button variant="ghost" size="icon" aria-label={`Sunting ${e.institution_name}`} onClick={() => setEditing(e.id)}>
                  <Pencil aria-hidden />
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Padam ${e.institution_name}`} disabled={pending} onClick={() => remove(e.id)}>
                  <Trash2 aria-hidden />
                </Button>
              </div>
            </li>
          ),
        )}
      </ul>
      {editing === 'new' ? (
        <EducationForm record={null} onDone={() => setEditing(null)} />
      ) : (
        <Button variant="outline" onClick={() => setEditing('new')}>
          <Plus aria-hidden /> Tambah pendidikan
        </Button>
      )}
    </div>
  );
}
