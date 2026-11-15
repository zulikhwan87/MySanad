'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { FileUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CheckboxField, SelectField, TextField } from '@/components/forms/fields';
import { useActionForm } from '@/components/auth/use-action-form';
import { StatusBadge } from '@/components/teacher/status-badge';
import { FormMessage, SubmitRow } from './form-shell';
import { deleteIjazahAction, saveIjazahAction } from '@/lib/actions/teacher-actions';
import { IjazahSchema, type IjazahInput } from '@/lib/validations/teacher';
import type { ActionResult } from '@/lib/validations/auth';
import type { IjazahRecord, TeacherReferenceData } from '@/types/teacher';

function IjazahForm({
  record,
  reference,
  onDone,
  teacherId,
}: {
  record: IjazahRecord | null;
  reference: TeacherReferenceData;
  onDone: () => void;
  teacherId?: string;
}) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<IjazahInput>({
    resolver: zodResolver(IjazahSchema),
    defaultValues: {
      ijazah_title: record?.ijazah_title ?? '',
      granting_sheikh_rumi: record?.granting_sheikh_rumi ?? '',
      granting_sheikh_arabic: record?.granting_sheikh_arabic ?? '',
      granting_institution: record?.granting_institution ?? '',
      qiraat_id: record?.qiraat_id ?? '',
      riwayat_id: record?.riwayat_id ?? '',
      tariq_id: record?.tariq_id ?? '',
      conferral_date: record?.conferral_date ?? '',
      conferral_place: record?.conferral_place ?? '',
      show_date_publicly: record?.show_date_publicly ?? true,
    },
  });
  const { pending, result, run } = useActionForm(setError);
  const qiraat = watch('qiraat_id');

  return (
    <form
      noValidate
      className="space-y-4 rounded-2xl border bg-secondary/40 p-4"
      onSubmit={handleSubmit((values) =>
        run(async () => {
          const res = await saveIjazahAction(record?.id ?? null, values, teacherId);
          if (res.ok) {
            onDone();
            router.refresh();
          }
          return res;
        }),
      )}
    >
      <FormMessage result={result} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="ij-title" label="Tajuk ijazah" required className="sm:col-span-2" error={errors.ijazah_title?.message} {...register('ijazah_title')} />
        <TextField id="ij-sheikh" label="Syeikh pemberi ijazah (Rumi)" required error={errors.granting_sheikh_rumi?.message} {...register('granting_sheikh_rumi')} />
        <TextField id="ij-sheikh-ar" label="Syeikh pemberi ijazah (Arab)" dir="rtl" lang="ar" error={errors.granting_sheikh_arabic?.message} {...register('granting_sheikh_arabic')} />
        <SelectField id="ij-qiraat" label="Qiraat" options={reference.qiraat.map((q) => ({ value: q.id, label: q.label }))} error={errors.qiraat_id?.message} {...register('qiraat_id')} />
        <SelectField
          id="ij-riwayat"
          label="Riwayat"
          disabled={!qiraat}
          options={reference.riwayat.filter((r) => r.qiraat_id === qiraat).map((r) => ({ value: r.id, label: r.label }))}
          error={errors.riwayat_id?.message}
          {...register('riwayat_id')}
        />
        <SelectField id="ij-tariq" label="Tariq" options={reference.tariq.map((t) => ({ value: t.id, label: t.label }))} error={errors.tariq_id?.message} {...register('tariq_id')} />
        <TextField id="ij-inst" label="Institusi" error={errors.granting_institution?.message} {...register('granting_institution')} />
        <TextField id="ij-date" label="Tarikh ijazah" type="date" error={errors.conferral_date?.message} {...register('conferral_date')} />
        <TextField id="ij-place" label="Tempat" error={errors.conferral_place?.message} {...register('conferral_place')} />
      </div>
      <CheckboxField id="ij-showdate" label="Papar tarikh ijazah kepada umum" {...register('show_date_publicly')} />
      <SubmitRow
        pending={pending}
        label={record ? 'Simpan perubahan' : 'Tambah ijazah'}
        secondary={
          <Button type="button" variant="ghost" onClick={onDone}>
            Batal
          </Button>
        }
      />
    </form>
  );
}

export function IjazahManager({
  items,
  reference,
  teacherId,
  documentsHref = '/teacher/documents',
}: {
  items: IjazahRecord[];
  reference: TeacherReferenceData;
  teacherId?: string;
  documentsHref?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [message, setMessage] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const label = (list: Array<{ id: string; label: string }>, id: string | null) => list.find((x) => x.id === id)?.label;

  function remove(id: string) {
    if (!window.confirm('Padam rekod ijazah ini?')) return;
    startTransition(async () => {
      const res = await deleteIjazahAction(id, teacherId);
      setMessage(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <FormMessage result={message} />
      {items.length === 0 && editing !== 'new' ? <p className="text-sm text-muted-foreground">Belum ada rekod ijazah.</p> : null}
      <ul className="space-y-3">
        {items.map((r) =>
          editing === r.id ? (
            <li key={r.id}>
              <IjazahForm record={r} reference={reference} teacherId={teacherId} onDone={() => setEditing(null)} />
            </li>
          ) : (
            <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-4">
              <div>
                <p className="font-medium text-forest-900">{r.ijazah_title}</p>
                <p className="text-sm text-muted-foreground">
                  {r.granting_sheikh_rumi}
                  {[label(reference.riwayat, r.riwayat_id), r.conferral_date?.slice(0, 4)].filter(Boolean).map((x) => ` · ${x}`)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={r.verification_status} />
                <Button asChild variant="ghost" size="icon" aria-label={`Muat naik sijil untuk ${r.ijazah_title}`}>
                  <Link href={`${documentsHref}${documentsHref.includes('?') ? '&' : '?'}ijazah=${r.id}`}>
                    <FileUp aria-hidden />
                  </Link>
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Sunting ${r.ijazah_title}`} onClick={() => setEditing(r.id)}>
                  <Pencil aria-hidden />
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Padam ${r.ijazah_title}`} disabled={pending} onClick={() => remove(r.id)}>
                  <Trash2 aria-hidden />
                </Button>
              </div>
            </li>
          ),
        )}
      </ul>
      {editing === 'new' ? (
        <IjazahForm record={null} reference={reference} teacherId={teacherId} onDone={() => setEditing(null)} />
      ) : (
        <Button variant="outline" onClick={() => setEditing('new')}>
          <Plus aria-hidden /> Tambah ijazah
        </Button>
      )}
    </div>
  );
}
