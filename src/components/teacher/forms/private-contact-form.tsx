'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { SelectField, TextareaField, TextField } from '@/components/forms/fields';
import { useActionForm } from '@/components/auth/use-action-form';
import { FormMessage, SubmitRow } from './form-shell';
import { savePrivateContactAction } from '@/lib/actions/teacher-actions';
import { PrivateContactSchema, type PrivateContactInput } from '@/lib/validations/teacher';
import type { TeacherRecord, TeacherReferenceData } from '@/types/teacher';

export function PrivateContactForm({ teacher, reference }: { teacher: TeacherRecord; reference: TeacherReferenceData }) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<PrivateContactInput>({
    resolver: zodResolver(PrivateContactSchema),
    defaultValues: {
      private_phone: teacher.private_phone ?? '',
      residential_state_id: teacher.residential_state_id ?? '',
      residential_district_id: teacher.residential_district_id ?? '',
      residential_address: teacher.residential_address ?? '',
    },
  });
  const { pending, result, run } = useActionForm(setError);
  const state = watch('residential_state_id');

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((values) =>
        run(async () => {
          const res = await savePrivateContactAction(values);
          if (res.ok) router.refresh();
          return res;
        }),
      )}
    >
      <FormMessage result={result} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="pc-phone" label="Telefon peribadi" type="tel" autoComplete="tel" error={errors.private_phone?.message} {...register('private_phone')} />
        <div className="hidden sm:block" />
        <SelectField
          id="pc-state"
          label="Negeri kediaman"
          options={reference.states.map((s) => ({ value: s.id, label: s.name }))}
          error={errors.residential_state_id?.message}
          {...register('residential_state_id')}
        />
        <SelectField
          id="pc-district"
          label="Daerah kediaman"
          disabled={!state}
          options={reference.districts.filter((d) => d.state_id === state).map((d) => ({ value: d.id, label: d.name }))}
          error={errors.residential_district_id?.message}
          {...register('residential_district_id')}
        />
        <TextareaField id="pc-address" label="Alamat kediaman" rows={2} className="sm:col-span-2" error={errors.residential_address?.message} {...register('residential_address')} />
      </div>
      <SubmitRow pending={pending} label="Simpan" />
    </form>
  );
}
