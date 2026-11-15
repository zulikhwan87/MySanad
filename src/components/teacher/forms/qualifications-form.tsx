'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { SelectField, TextField } from '@/components/forms/fields';
import { useActionForm } from '@/components/auth/use-action-form';
import { FormMessage, SubmitRow } from './form-shell';
import { saveQualificationsStepAction } from '@/lib/actions/teacher-actions';
import { QualificationsStepSchema, type QualificationsStepInput } from '@/lib/validations/teacher';
import type { TeacherRecord, TeacherReferenceData } from '@/types/teacher';

export function QualificationsForm({
  teacher,
  reference,
  nextHref,
  teacherId,
}: {
  teacher: TeacherRecord;
  reference: TeacherReferenceData;
  nextHref: string;
  teacherId?: string;
}) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    watch,
    setValue,
    formState: { errors },
  } = useForm<QualificationsStepInput>({
    resolver: zodResolver(QualificationsStepSchema),
    defaultValues: {
      primary_qiraat_id: teacher.primary_qiraat_id ?? '',
      primary_riwayat_id: teacher.primary_riwayat_id ?? '',
      specializations: (teacher.specializations ?? []).join(', '),
    },
  });
  const { pending, result, run } = useActionForm(setError);
  const qiraat = watch('primary_qiraat_id');
  const qiraatField = register('primary_qiraat_id');

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((values) =>
        run(async () => {
          const res = await saveQualificationsStepAction(values, teacherId);
          if (res.ok) router.push(nextHref);
          return res;
        }),
      )}
    >
      <FormMessage result={result} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="primary_qiraat_id"
          label="Qiraat utama"
          required
          options={reference.qiraat.map((q) => ({ value: q.id, label: q.label }))}
          error={errors.primary_qiraat_id?.message}
          {...qiraatField}
          onChange={(e) => {
            void qiraatField.onChange(e);
            setValue('primary_riwayat_id', '');
          }}
        />
        <SelectField
          id="primary_riwayat_id"
          label="Riwayat utama"
          disabled={!qiraat}
          options={reference.riwayat.filter((r) => r.qiraat_id === qiraat).map((r) => ({ value: r.id, label: r.label }))}
          error={errors.primary_riwayat_id?.message}
          {...register('primary_riwayat_id')}
        />
        <TextField
          id="specializations"
          label="Pengkhususan"
          className="sm:col-span-2"
          hint="Pisahkan dengan koma. Contoh: Tahsin, Tahfiz, Qiraat Sab'ah."
          error={errors.specializations?.message as string | undefined}
          {...register('specializations')}
        />
      </div>
      <SubmitRow pending={pending} label="Simpan & teruskan" />
    </form>
  );
}
