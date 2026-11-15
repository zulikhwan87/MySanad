'use client';

import { SelectField, TextareaField, TextField } from '@/components/forms/fields';
import { GENERATION_CATEGORIES, type SanadNodeInput } from '@/lib/validations/sanad';

export const EMPTY_NODE: SanadNodeInput = {
  full_name_rumi: '',
  full_name_arabic: '',
  alternative_spellings: '',
  historical_title: '',
  generation_category: '',
  birth_year_hijri: '',
  death_year_hijri: '',
  birth_year_miladi: '',
  death_year_miladi: '',
  country_or_region: '',
  biography: '',
  scholarly_references: '',
};

export function NodeFields({
  value,
  onChange,
  errors,
  prefix,
  compact = false,
  detailed = false,
}: {
  value: SanadNodeInput;
  onChange: (v: SanadNodeInput) => void;
  errors: Record<string, string>;
  prefix: string;
  compact?: boolean;
  /** Category and title fields: only for the administrators' reference list. Teachers enter names only. */
  detailed?: boolean;
}) {
  const set = (key: keyof SanadNodeInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    onChange({ ...value, [key]: e.target.value });
  const err = (k: string) => errors[`${prefix}${k}`] ?? errors[k];
  const str = (v: unknown) => (Array.isArray(v) ? v.join(', ') : ((v as string | number | undefined) ?? ''));

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField id={`${prefix}rumi`} label="Nama (Rumi)" required value={str(value.full_name_rumi)} onChange={set('full_name_rumi')} error={err('full_name_rumi')} />
      <TextField id={`${prefix}arab`} label="Nama (Arab)" dir="rtl" lang="ar" value={str(value.full_name_arabic)} onChange={set('full_name_arabic')} error={err('full_name_arabic')} />
      {detailed ? (
        <>
          <SelectField
            id={`${prefix}cat`}
            label="Kategori generasi"
            options={GENERATION_CATEGORIES.map((c) => ({ value: c, label: c }))}
            value={str(value.generation_category)}
            onChange={set('generation_category')}
            error={err('generation_category')}
          />
          <TextField id={`${prefix}title`} label="Gelaran" value={str(value.historical_title)} onChange={set('historical_title')} error={err('historical_title')} />
        </>
      ) : null}
      <TextField id={`${prefix}alt`} label="Ejaan alternatif" hint="Pisahkan dengan koma." value={str(value.alternative_spellings)} onChange={set('alternative_spellings')} />
      <TextField id={`${prefix}region`} label="Negara / wilayah" value={str(value.country_or_region)} onChange={set('country_or_region')} />
      {compact ? null : (
        <>
          <TextField id={`${prefix}bh`} label="Tahun lahir (Hijrah)" value={str(value.birth_year_hijri)} onChange={set('birth_year_hijri')} />
          <TextField id={`${prefix}dh`} label="Tahun wafat (Hijrah)" value={str(value.death_year_hijri)} onChange={set('death_year_hijri')} />
          <TextField id={`${prefix}bm`} label="Tahun lahir (Masihi)" type="number" value={str(value.birth_year_miladi)} onChange={set('birth_year_miladi')} error={err('birth_year_miladi')} />
          <TextField id={`${prefix}dm`} label="Tahun wafat (Masihi)" type="number" value={str(value.death_year_miladi)} onChange={set('death_year_miladi')} error={err('death_year_miladi')} />
          <TextareaField id={`${prefix}bio`} label="Biografi ringkas" rows={3} className="sm:col-span-2" value={str(value.biography)} onChange={set('biography')} error={err('biography')} />
          <TextareaField
            id={`${prefix}refs`}
            label="Rujukan ilmiah"
            hint="Satu rujukan setiap baris (kitab, jilid/halaman)."
            rows={2}
            className="sm:col-span-2"
            value={Array.isArray(value.scholarly_references) ? value.scholarly_references.join('\n') : str(value.scholarly_references)}
            onChange={set('scholarly_references')}
          />
        </>
      )}
    </div>
  );
}
