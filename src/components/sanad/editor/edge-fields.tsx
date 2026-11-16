'use client';

import { SelectField, TextareaField, TextField } from '@/components/forms/fields';
import { transmissionOptions, type SanadEdgeInput } from '@/lib/validations/sanad';

export const EMPTY_EDGE: SanadEdgeInput = {
  transmission_relationship: '',
  riwayat_context: '',
  transmission_date_text: '',
  transmission_location: '',
  sequence_order: 1,
  supporting_evidence: '',
  notes: '',
};

export function EdgeFields({
  value,
  onChange,
  errors,
  prefix,
}: {
  value: SanadEdgeInput;
  onChange: (v: SanadEdgeInput) => void;
  errors: Record<string, string>;
  prefix: string;
}) {
  const set = (key: keyof SanadEdgeInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    onChange({ ...value, [key]: e.target.value });
  const err = (k: string) => errors[`${prefix}${k}`] ?? errors[k];
  const str = (v: unknown) => ((v as string | number | undefined) ?? '').toString();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField
        id={`${prefix}rel`}
        label="Kaedah pengambilan"
        placeholder="Pilih…"
        options={transmissionOptions(value.transmission_relationship)}
        value={str(value.transmission_relationship)}
        onChange={set('transmission_relationship')}
        error={err('transmission_relationship')}
      />
      <TextField id={`${prefix}ctx`} label="Konteks riwayat" hint="Contoh: Hafs 'an 'Asim, Tariq al-Syatibiyyah" value={str(value.riwayat_context)} onChange={set('riwayat_context')} />
      <TextField id={`${prefix}date`} label="Tarikh / tempoh" hint="Teks bebas, cth: 1420H atau sekitar 1990-an" value={str(value.transmission_date_text)} onChange={set('transmission_date_text')} />
      <TextField id={`${prefix}loc`} label="Tempat" value={str(value.transmission_location)} onChange={set('transmission_location')} />
      <TextareaField
        id={`${prefix}evidence`}
        label="Bukti sokongan (sulit)"
        hint="Untuk pentadbir sahaja; tidak dipaparkan kepada umum."
        rows={2}
        value={str(value.supporting_evidence)}
        onChange={set('supporting_evidence')}
        error={err('supporting_evidence')}
      />
      <TextareaField id={`${prefix}notes`} label="Catatan (sulit)" rows={2} value={str(value.notes)} onChange={set('notes')} error={err('notes')} />
    </div>
  );
}
