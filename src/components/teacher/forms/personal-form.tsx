'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { SelectField, TextareaField, TextField } from '@/components/forms/fields';
import { useActionForm } from '@/components/auth/use-action-form';
import { FormMessage, FormSection, SubmitRow } from './form-shell';
import { savePersonalStepAction } from '@/lib/actions/teacher-actions';
import { GENDERS, PersonalStepSchema, type PersonalStepInput } from '@/lib/validations/teacher';
import type { TeacherRecord, TeacherReferenceData } from '@/types/teacher';

export function PersonalForm({
  teacher,
  reference,
  piiEnabled,
  nextHref,
}: {
  teacher: TeacherRecord | null;
  reference: TeacherReferenceData;
  piiEnabled: boolean;
  nextHref: string;
}) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<PersonalStepInput>({
    resolver: zodResolver(PersonalStepSchema),
    defaultValues: {
      full_name_rumi: teacher?.full_name_rumi ?? '',
      full_name_arabic: teacher?.full_name_arabic ?? '',
      public_display_name: teacher?.public_display_name ?? '',
      professional_title: teacher?.professional_title ?? '',
      gender: teacher?.gender ?? undefined,
      alternative_spellings: (teacher?.alternative_spellings ?? []).join(', '),
      ic_number: '',
      private_phone: teacher?.private_phone ?? '',
      residential_state_id: teacher?.residential_state_id ?? '',
      residential_district_id: teacher?.residential_district_id ?? '',
      residential_address: teacher?.residential_address ?? '',
    },
  });
  const { pending, result, run } = useActionForm(setError);
  const residentialState = watch('residential_state_id');

  return (
    <form
      noValidate
      className="space-y-8"
      onSubmit={handleSubmit((values) =>
        run(async () => {
          const res = await savePersonalStepAction(values);
          if (res.ok) router.push(nextHref);
          return res;
        }),
      )}
    >
      <FormMessage result={result} />
      <FormSection title="Nama & gelaran" description="Nama paparan awam akan dipaparkan dalam direktori selepas diluluskan.">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField id="full_name_rumi" label="Nama penuh (Rumi)" required autoComplete="name" error={errors.full_name_rumi?.message} {...register('full_name_rumi')} />
          <TextField
            id="full_name_arabic"
            label="Nama penuh (Arab)"
            dir="rtl"
            lang="ar"
            className="[&_input]:font-arabic"
            error={errors.full_name_arabic?.message}
            {...register('full_name_arabic')}
          />
          <TextField id="public_display_name" label="Nama paparan awam" required error={errors.public_display_name?.message} {...register('public_display_name')} />
          <TextField
            id="professional_title"
            label="Gelaran ilmiah / keagamaan"
            hint="Contoh: Al-Muqri, Ustaz, Dr. Gelaran dipaparkan selepas diluluskan."
            error={errors.professional_title?.message}
            {...register('professional_title')}
          />
          <SelectField
            id="gender"
            label="Jantina"
            options={GENDERS.map((g) => ({ value: g, label: g }))}
            error={errors.gender?.message}
            {...register('gender')}
          />
          <TextField
            id="alternative_spellings"
            label="Ejaan nama alternatif"
            hint="Pisahkan dengan koma. Membantu carian, cth: Abdullah, Abdollah."
            error={errors.alternative_spellings?.message as string | undefined}
            {...register('alternative_spellings')}
          />
        </div>
      </FormSection>

      <FormSection
        title="Maklumat pengesahan (sulit)"
        description="Hanya untuk pentadbir MySanad. Tidak sekali-kali dipaparkan kepada umum."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            id="ic_number"
            label="No. MyKad"
            inputMode="numeric"
            autoComplete="off"
            placeholder={teacher?.ic_masked ?? '880101-03-1234'}
            disabled={!piiEnabled}
            hint={
              !piiEnabled
                ? 'Penyimpanan MyKad belum diaktifkan oleh pentadbir sistem.'
                : teacher?.has_ic
                  ? `Disimpan (${teacher.ic_masked ?? 'disulitkan'}). Kosongkan untuk kekalkan.`
                  : 'Pilihan. Disulitkan sebelum disimpan.'
            }
            error={errors.ic_number?.message}
            {...register('ic_number')}
          />
          <TextField id="private_phone" label="Telefon peribadi" type="tel" autoComplete="tel" error={errors.private_phone?.message} {...register('private_phone')} />
          <SelectField
            id="residential_state_id"
            label="Negeri kediaman"
            options={reference.states.map((s) => ({ value: s.id, label: s.name }))}
            error={errors.residential_state_id?.message}
            {...register('residential_state_id')}
          />
          <SelectField
            id="residential_district_id"
            label="Daerah kediaman"
            options={reference.districts.filter((d) => d.state_id === residentialState).map((d) => ({ value: d.id, label: d.name }))}
            disabled={!residentialState}
            error={errors.residential_district_id?.message}
            {...register('residential_district_id')}
          />
          <TextareaField
            id="residential_address"
            label="Alamat kediaman"
            rows={2}
            className="sm:col-span-2"
            autoComplete="street-address"
            error={errors.residential_address?.message}
            {...register('residential_address')}
          />
        </div>
      </FormSection>

      <SubmitRow pending={pending} label="Simpan & teruskan" />
    </form>
  );
}
