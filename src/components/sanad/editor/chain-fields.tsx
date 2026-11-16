'use client';

import { CheckboxField, SelectField, TextareaField, TextField } from '@/components/forms/fields';
import { transmissionOptions, type SanadChainInput } from '@/lib/validations/sanad';
import type { TeacherReferenceData } from '@/types/teacher';

export function ChainFields({
  value,
  onChange,
  errors,
  reference,
}: {
  value: SanadChainInput;
  onChange: (v: SanadChainInput) => void;
  errors: Record<string, string>;
  reference: TeacherReferenceData;
}) {
  const set = (key: keyof SanadChainInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    onChange({ ...value, [key]: e.target.value });
  const err = (k: string) => errors[`chain.${k}`] ?? errors[k];
  const str = (v: unknown) => ((v as string | undefined) ?? '').toString();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField id="c-title" label="Tajuk sanad" required className="sm:col-span-2" placeholder="Contoh: Sanad Riwayat Hafs 'an 'Asim" value={str(value.title)} onChange={set('title')} error={err('title')} />
      <SelectField
        id="c-qiraat"
        label="Qiraat"
        required
        options={reference.qiraat.map((q) => ({ value: q.id, label: q.label }))}
        value={str(value.qiraat_id)}
        onChange={(e) => onChange({ ...value, qiraat_id: e.target.value, riwayat_id: '' })}
        error={err('qiraat_id')}
      />
      <SelectField
        id="c-riwayat"
        label="Riwayat"
        required
        disabled={!value.qiraat_id}
        options={reference.riwayat.filter((r) => r.qiraat_id === value.qiraat_id).map((r) => ({ value: r.id, label: r.label }))}
        value={str(value.riwayat_id)}
        onChange={set('riwayat_id')}
        error={err('riwayat_id')}
      />
      <SelectField id="c-tariq" label="Tariq" options={reference.tariq.map((t) => ({ value: t.id, label: t.label }))} value={str(value.tariq_id)} onChange={set('tariq_id')} />
      <SelectField
        id="c-method"
        label="Kaedah pengambilan anda"
        options={transmissionOptions(value.transmission_method)}
        value={str(value.transmission_method)}
        onChange={set('transmission_method')}
        error={err('transmission_method')}
      />
      <TextField id="c-date" label="Tarikh ijazah" type="date" value={str(value.ijazah_date)} onChange={set('ijazah_date')} error={err('ijazah_date')} />
      <TextField id="c-loc" label="Tempat ijazah" value={str(value.ijazah_location)} onChange={set('ijazah_location')} />
      <TextareaField id="c-notes" label="Catatan awam" rows={2} className="sm:col-span-2" value={str(value.public_notes)} onChange={set('public_notes')} error={err('public_notes')} />
      <CheckboxField
        id="c-export"
        className="sm:col-span-2"
        label="Benarkan pelawat mengeksport graf rantaian ini"
        description="Juga memerlukan tetapan 'Benarkan muat turun graf' dihidupkan."
        checked={Boolean(value.allow_public_graph_export)}
        onChange={(e) => onChange({ ...value, allow_public_graph_export: e.target.checked })}
      />
    </div>
  );
}
