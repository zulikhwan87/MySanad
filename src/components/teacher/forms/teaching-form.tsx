'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { CheckboxField, SelectField, TextareaField, TextField } from '@/components/forms/fields';
import { useActionForm } from '@/components/auth/use-action-form';
import { FormMessage, FormSection, SubmitRow } from './form-shell';
import { saveTeachingStepAction } from '@/lib/actions/teacher-actions';
import { INSTITUTION_CATEGORIES, TeachingStepSchema, type TeachingStepInput } from '@/lib/validations/teacher';
import type { TeacherRecord, TeacherReferenceData } from '@/types/teacher';

export function TeachingForm({
  teacher,
  reference,
  acceptingStudents,
  nextHref,
  submitLabel = 'Simpan & teruskan',
  teacherId,
}: {
  teacher: TeacherRecord;
  reference: TeacherReferenceData;
  acceptingStudents: boolean;
  nextHref?: string;
  submitLabel?: string;
  teacherId?: string;
}) {
  const router = useRouter();
  const [proposeNew, setProposeNew] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TeachingStepInput>({
    resolver: zodResolver(TeachingStepSchema),
    defaultValues: {
      teaching_state_id: teacher.teaching_state_id ?? '',
      teaching_district_id: teacher.teaching_district_id ?? '',
      primary_institution_id: teacher.primary_institution_id ?? '',
      new_institution_name: '',
      new_institution_category: undefined,
      teaching_experience_years: teacher.teaching_experience_years ?? 0,
      short_bio: teacher.short_bio ?? '',
      full_biography: teacher.full_biography ?? '',
      accepting_students: acceptingStudents,
    },
  });
  const { pending, result, run } = useActionForm(setError);
  const state = watch('teaching_state_id');
  const stateField = register('teaching_state_id');
  const bio = watch('short_bio') ?? '';
  const institutions = reference.institutions.filter((i) => i.state_id === state);

  return (
    <form
      noValidate
      className="space-y-8"
      onSubmit={handleSubmit((values) =>
        run(async () => {
          const res = await saveTeachingStepAction(proposeNew ? { ...values, primary_institution_id: '' } : { ...values, new_institution_name: '' }, teacherId);
          if (res.ok) {
            if (nextHref) router.push(nextHref);
            else router.refresh();
          }
          return res;
        }),
      )}
    >
      <FormMessage result={result} />
      <FormSection title="Lokasi mengajar" description="Tempat anda mengajar sekarang. Ini berbeza daripada tempat lahir atau alamat kediaman.">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            id="teaching_state_id"
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
            id="teaching_district_id"
            label="Daerah mengajar"
            disabled={!state}
            options={reference.districts.filter((d) => d.state_id === state).map((d) => ({ value: d.id, label: d.name }))}
            error={errors.teaching_district_id?.message}
            {...register('teaching_district_id')}
          />
        </div>
      </FormSection>

      <FormSection title="Institusi utama" description="Pilih institusi sedia ada, atau cadangkan institusi baharu (akan disemak oleh pentadbir).">
        {proposeNew ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="new_institution_name" label="Nama institusi baharu" error={errors.new_institution_name?.message} {...register('new_institution_name')} />
            <SelectField
              id="new_institution_category"
              label="Kategori"
              options={INSTITUTION_CATEGORIES.map((c) => ({ value: c, label: c }))}
              error={errors.new_institution_category?.message}
              {...register('new_institution_category')}
            />
          </div>
        ) : (
          <SelectField
            id="primary_institution_id"
            label="Institusi"
            disabled={!state}
            placeholder={state ? (institutions.length ? 'Tiada / pilih…' : 'Tiada institusi berdaftar di negeri ini') : 'Pilih negeri dahulu'}
            options={institutions.map((i) => ({ value: i.id, label: i.is_verified ? i.name : `${i.name} (belum disahkan)` }))}
            error={errors.primary_institution_id?.message}
            {...register('primary_institution_id')}
          />
        )}
        <Button type="button" variant="link" className="h-auto px-0" disabled={!state} onClick={() => setProposeNew((v) => !v)}>
          {proposeNew ? 'Pilih daripada senarai' : 'Institusi tiada dalam senarai? Cadangkan institusi baharu'}
        </Button>
      </FormSection>

      <FormSection title="Pengajaran & biografi">
        <div className="grid gap-4">
          <TextField
            id="teaching_experience_years"
            label="Pengalaman mengajar (tahun)"
            type="number"
            min={0}
            max={80}
            inputMode="numeric"
            className="max-w-xs"
            error={errors.teaching_experience_years?.message}
            {...register('teaching_experience_years')}
          />
          <TextareaField
            id="short_bio"
            label="Biografi ringkas"
            required
            rows={3}
            hint={`${bio.length}/500 aksara (minimum 30). Dipaparkan pada kad direktori.`}
            error={errors.short_bio?.message}
            {...register('short_bio')}
          />
          <TextareaField id="full_biography" label="Biografi penuh" rows={6} error={errors.full_biography?.message} {...register('full_biography')} />
          <CheckboxField id="accepting_students" label="Saya sedang menerima pelajar baharu" {...register('accepting_students')} />
        </div>
      </FormSection>

      <SubmitRow pending={pending} label={submitLabel} />
    </form>
  );
}
