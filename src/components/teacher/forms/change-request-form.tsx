'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { SelectField, TextareaField, TextField } from '@/components/forms/fields';
import { useActionForm } from '@/components/auth/use-action-form';
import { FormMessage, FormSection, SubmitRow } from './form-shell';
import { requestProfileChangeAction } from '@/lib/actions/teacher-actions';
import { ChangeRequestSchema, GENDERS, type ChangeRequestInput } from '@/lib/validations/teacher';
import type { TeacherRecord, TeacherReferenceData } from '@/types/teacher';

export function ChangeRequestForm({ teacher, reference }: { teacher: TeacherRecord; reference: TeacherReferenceData }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ChangeRequestInput>({
    resolver: zodResolver(ChangeRequestSchema),
    defaultValues: {
      full_name_rumi: teacher.full_name_rumi,
      full_name_arabic: teacher.full_name_arabic ?? '',
      public_display_name: teacher.public_display_name,
      professional_title: teacher.professional_title ?? '',
      gender: teacher.gender ?? undefined,
      alternative_spellings: (teacher.alternative_spellings ?? []).join(', '),
      primary_qiraat_id: teacher.primary_qiraat_id ?? '',
      primary_riwayat_id: teacher.primary_riwayat_id ?? '',
      specializations: (teacher.specializations ?? []).join(', '),
      teaching_state_id: teacher.teaching_state_id ?? '',
      teaching_district_id: teacher.teaching_district_id ?? '',
      primary_institution_id: teacher.primary_institution_id ?? '',
      teaching_experience_years: teacher.teaching_experience_years ?? 0,
      short_bio: teacher.short_bio ?? '',
      full_biography: teacher.full_biography ?? '',
      applicant_notes: '',
    },
  });
  const { pending, result, run } = useActionForm(setError);
  const state = watch('teaching_state_id');
  const qiraat = watch('primary_qiraat_id');
  const stateField = register('teaching_state_id');
  const qiraatField = register('primary_qiraat_id');

  return (
    <form
      noValidate
      className="space-y-8"
      onSubmit={handleSubmit((values) =>
        run(async () => {
          const res = await requestProfileChangeAction(values);
          if (res.ok) router.refresh();
          return res;
        }),
      )}
    >
      <FormMessage result={result} />
      <FormSection title="Nama & gelaran">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="cr-name" label="Nama penuh (Rumi)" required error={errors.full_name_rumi?.message} {...register('full_name_rumi')} />
          <TextField id="cr-name-ar" label="Nama penuh (Arab)" dir="rtl" lang="ar" error={errors.full_name_arabic?.message} {...register('full_name_arabic')} />
          <TextField id="cr-display" label="Nama paparan awam" required error={errors.public_display_name?.message} {...register('public_display_name')} />
          <TextField id="cr-title" label="Gelaran" error={errors.professional_title?.message} {...register('professional_title')} />
          <SelectField id="cr-gender" label="Jantina" options={GENDERS.map((g) => ({ value: g, label: g }))} {...register('gender')} />
          <TextField id="cr-alt" label="Ejaan alternatif" hint="Pisahkan dengan koma." {...register('alternative_spellings')} />
        </div>
      </FormSection>
      <FormSection title="Kelayakan al-Quran">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="cr-qiraat"
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
            id="cr-riwayat"
            label="Riwayat utama"
            disabled={!qiraat}
            options={reference.riwayat.filter((r) => r.qiraat_id === qiraat).map((r) => ({ value: r.id, label: r.label }))}
            error={errors.primary_riwayat_id?.message}
            {...register('primary_riwayat_id')}
          />
          <TextField id="cr-spec" label="Pengkhususan" className="sm:col-span-2" {...register('specializations')} />
        </div>
      </FormSection>
      <FormSection title="Pengajaran">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="cr-state"
            label="Negeri mengajar"
            required
            options={reference.states.map((s) => ({ value: s.id, label: s.name }))}
            error={errors.teaching_state_id?.message}
            {...stateField}
            onChange={(e) => {
              void stateField.onChange(e);
              setValue('teaching_district_id', '');
              setValue('primary_institution_id', '');
            }}
          />
          <SelectField
            id="cr-district"
            label="Daerah mengajar"
            disabled={!state}
            options={reference.districts.filter((d) => d.state_id === state).map((d) => ({ value: d.id, label: d.name }))}
            error={errors.teaching_district_id?.message}
            {...register('teaching_district_id')}
          />
          <SelectField
            id="cr-inst"
            label="Institusi"
            disabled={!state}
            options={reference.institutions.filter((i) => i.state_id === state).map((i) => ({ value: i.id, label: i.name }))}
            error={errors.primary_institution_id?.message}
            {...register('primary_institution_id')}
          />
          <TextField id="cr-exp" label="Pengalaman (tahun)" type="number" min={0} max={80} error={errors.teaching_experience_years?.message} {...register('teaching_experience_years')} />
          <TextareaField id="cr-bio" label="Biografi ringkas" required rows={3} className="sm:col-span-2" error={errors.short_bio?.message} {...register('short_bio')} />
          <TextareaField id="cr-fullbio" label="Biografi penuh" rows={5} className="sm:col-span-2" error={errors.full_biography?.message} {...register('full_biography')} />
        </div>
      </FormSection>
      <TextareaField id="cr-notes" label="Sebab perubahan (kepada pentadbir)" rows={2} error={errors.applicant_notes?.message} {...register('applicant_notes')} />
      <SubmitRow pending={pending} label="Hantar permohonan perubahan" />
    </form>
  );
}
