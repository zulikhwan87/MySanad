'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil, Plus } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField, TextareaField, TextField } from '@/components/forms/fields';
import type { ActionResult } from '@/lib/validations/auth';

export interface FieldDef {
  name: string;
  label: string;
  type?: 'text' | 'arabic' | 'textarea' | 'number' | 'select';
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  hint?: string;
}

type Values = Record<string, string>;

/** Generic add/edit form for a reference-data row; the server action validates everything. */
export function RecordEditor({
  fields,
  initial,
  action,
  addLabel,
  editLabel,
  readOnly,
}: {
  fields: FieldDef[];
  initial?: Values;
  action: (raw: unknown) => Promise<ActionResult>;
  addLabel?: string;
  editLabel?: string;
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Values>(initial ?? {});
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  if (readOnly) return null;

  if (!open) {
    return initial ? (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label={editLabel ?? 'Sunting'}>
        <Pencil aria-hidden /> Sunting
      </Button>
    ) : (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus aria-hidden /> {addLabel ?? 'Tambah'}
      </Button>
    );
  }

  const err = (n: string) => result?.fieldErrors?.[n]?.[0];
  return (
    <form
      noValidate
      className="w-full space-y-3 rounded-xl border bg-secondary/40 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await action(initial?.id ? { ...values, id: initial.id } : values);
          setResult(res);
          if (res.ok) {
            setOpen(false);
            if (!initial) setValues({});
            router.refresh();
          }
        });
      }}
    >
      {result && !result.ok && result.message ? <Alert variant="destructive">{result.message}</Alert> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => {
          const common = {
            id: `${initial?.id ?? 'new'}-${f.name}`,
            label: f.label,
            required: f.required,
            hint: f.hint,
            error: err(f.name),
            value: values[f.name] ?? '',
          };
          const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
            setValues({ ...values, [f.name]: e.target.value });
          if (f.type === 'select') return <SelectField key={f.name} {...common} options={f.options ?? []} onChange={onChange} />;
          if (f.type === 'textarea') return <TextareaField key={f.name} {...common} rows={2} className="sm:col-span-2" onChange={onChange} />;
          return (
            <TextField
              key={f.name}
              {...common}
              type={f.type === 'number' ? 'number' : 'text'}
              dir={f.type === 'arabic' ? 'rtl' : undefined}
              lang={f.type === 'arabic' ? 'ar' : undefined}
              onChange={onChange}
            />
          );
        })}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Batal
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null} Simpan
        </Button>
      </div>
    </form>
  );
}
