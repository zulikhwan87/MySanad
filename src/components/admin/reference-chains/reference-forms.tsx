'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Copy, Loader2, PauseCircle, Plus, Trash2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SelectField, TextareaField, TextField } from '@/components/forms/fields';
import { NodePicker } from '@/components/sanad/editor/node-picker';
import {
  createReferenceChainAction,
  createReferenceFromChainAction,
  deleteReferenceChainAction,
  setReferenceStatusAction,
  updateReferenceMetaAction,
} from '@/lib/actions/reference-chain-actions';
import { NewReferenceChainSchema, type ReferenceChainMetaInput } from '@/lib/validations/reference';
import { issuesByPath } from '@/lib/validations/issues';
import type { NodeChoiceInput } from '@/lib/validations/sanad';
import type { ActionResult } from '@/lib/validations/auth';
import type { TeacherReferenceData } from '@/types/teacher';

const STATUS = {
  draft: { label: 'Draf', variant: 'warning' },
  active: { label: 'Aktif', variant: 'default' },
  inactive: { label: 'Tidak aktif', variant: 'outline' },
} as const;

export function ReferenceStatusBadge({ status }: { status: keyof typeof STATUS }) {
  return <Badge variant={STATUS[status].variant}>{STATUS[status].label}</Badge>;
}

function MetaFields({
  value,
  onChange,
  errors,
  reference,
}: {
  value: ReferenceChainMetaInput;
  onChange: (v: ReferenceChainMetaInput) => void;
  errors: Record<string, string>;
  reference: TeacherReferenceData;
}) {
  const str = (v: unknown) => (v as string | undefined) ?? '';
  const err = (k: string) => errors[`meta.${k}`] ?? errors[k];
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField
        id="rc-title"
        label="Tajuk rantaian rujukan"
        required
        className="sm:col-span-2"
        placeholder="Contoh: Hafs 'an 'Asim, Tariq al-Syatibiyyah (melalui Syeikh ...)"
        value={str(value.title)}
        error={err('title')}
        onChange={(e) => onChange({ ...value, title: e.target.value })}
      />
      <SelectField
        id="rc-qiraat"
        label="Qiraat"
        options={reference.qiraat.map((q) => ({ value: q.id, label: q.label }))}
        value={str(value.qiraat_id)}
        onChange={(e) => onChange({ ...value, qiraat_id: e.target.value, riwayat_id: '' })}
      />
      <SelectField
        id="rc-riwayat"
        label="Riwayat"
        disabled={!value.qiraat_id}
        options={reference.riwayat.filter((r) => r.qiraat_id === value.qiraat_id).map((r) => ({ value: r.id, label: r.label }))}
        value={str(value.riwayat_id)}
        onChange={(e) => onChange({ ...value, riwayat_id: e.target.value })}
      />
      <SelectField
        id="rc-tariq"
        label="Tariq"
        options={reference.tariq.map((t) => ({ value: t.id, label: t.label }))}
        value={str(value.tariq_id)}
        onChange={(e) => onChange({ ...value, tariq_id: e.target.value })}
      />
      <TextareaField
        id="rc-notes"
        label="Catatan pentadbir (sumber rujukan, kitab, siapa yang menyemak)"
        rows={2}
        className="sm:col-span-2"
        value={str(value.notes)}
        error={err('notes')}
        onChange={(e) => onChange({ ...value, notes: e.target.value })}
      />
    </div>
  );
}

const EMPTY_META: ReferenceChainMetaInput = { title: '', qiraat_id: '', riwayat_id: '', tariq_id: '', notes: '' };

export function NewReferenceChainForm({ reference }: { reference: TeacherReferenceData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [meta, setMeta] = useState<ReferenceChainMetaInput>(EMPTY_META);
  const [root, setRoot] = useState<NodeChoiceInput>({ mode: 'existing', node_id: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus aria-hidden /> Cipta rantaian rujukan
      </Button>
    );
  }
  return (
    <form
      noValidate
      className="space-y-4 rounded-2xl border bg-secondary/40 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const payload = { meta, root };
        const parsed = NewReferenceChainSchema.safeParse(payload);
        if (!parsed.success) return setErrors(issuesByPath(parsed.error));
        setErrors({});
        startTransition(async () => {
          const res = await createReferenceChainAction(payload);
          setResult(res);
          if (res.ok && res.id) router.push(`/admin/reference-chains/${res.id}`);
        });
      }}
    >
      {result && !result.ok ? <Alert variant="destructive">{result.message}</Alert> : null}
      <MetaFields value={meta} onChange={setMeta} errors={errors} reference={reference} />
      <div className="space-y-2">
        <p className="text-sm font-semibold text-forest-900">Perawi permulaan (paling bawah)</p>
        <p className="text-sm text-muted-foreground">
          Perawi yang paling hampir dengan guru-guru semasa. Selepas ini, tambah guru-gurunya satu demi satu hingga ke atas.
        </p>
        <NodePicker value={root} onChange={setRoot} errors={errors} prefix="root.node." />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Batal
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null} Cipta draf
        </Button>
      </div>
    </form>
  );
}

export function CopyFromChainForm({ chains }: { chains: Array<{ id: string; label: string; perawi: Array<{ id: string; name: string }> }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [chainId, setChainId] = useState('');
  const [rootId, setRootId] = useState('');
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const chain = chains.find((c) => c.id === chainId);

  if (!open) {
    return (
      <Button variant="outline" onClick={() => setOpen(true)} disabled={!chains.length}>
        <Copy aria-hidden /> Salin daripada rantaian yang diluluskan
      </Button>
    );
  }
  return (
    <form
      noValidate
      className="space-y-4 rounded-2xl border bg-secondary/40 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await createReferenceFromChainAction({ title, chain_id: chainId, root_node_id: rootId });
          setResult(res);
          if (res.ok && res.id) router.push(`/admin/reference-chains/${res.id}`);
        });
      }}
    >
      {result && !result.ok ? <Alert variant="destructive">{result.message}</Alert> : null}
      <Alert variant="info">
        Bahagian rantaian dari perawi yang dipilih hingga ke atas akan disalin sebagai <strong>draf</strong>. Rantaian asal tidak
        berubah. Semak setiap perawi sebelum mengaktifkannya.
      </Alert>
      <TextField id="cp-title" label="Tajuk rantaian rujukan" required value={title} onChange={(e) => setTitle(e.target.value)} error={result?.fieldErrors?.title?.[0]} />
      <SelectField
        id="cp-chain"
        label="Rantaian yang diluluskan"
        required
        options={chains.map((c) => ({ value: c.id, label: c.label }))}
        value={chainId}
        onChange={(e) => {
          setChainId(e.target.value);
          setRootId('');
        }}
      />
      <SelectField
        id="cp-root"
        label="Mula daripada perawi (salin perawi ini dan semua di atasnya)"
        required
        disabled={!chain}
        options={(chain?.perawi ?? []).map((p) => ({ value: p.id, label: p.name }))}
        value={rootId}
        onChange={(e) => setRootId(e.target.value)}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Batal
        </Button>
        <Button type="submit" disabled={pending || !chainId || !rootId}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null} Salin sebagai draf
        </Button>
      </div>
    </form>
  );
}

export function ReferenceStatusPanel({ id, status }: { id: string; status: 'draft' | 'active' | 'inactive' }) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<ActionResult>, after?: () => void) =>
    startTransition(async () => {
      const res = await fn();
      setResult(res);
      if (res.ok) (after ?? router.refresh)();
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Status:</span>
        <ReferenceStatusBadge status={status} />
      </div>
      {result?.message ? <Alert variant={result.ok ? 'success' : 'destructive'}>{result.message}</Alert> : null}
      {status === 'active' ? (
        <>
          <p className="text-sm text-muted-foreground">
            Guru boleh menyalin rantaian ini. Untuk menyunting, nyahaktifkan dahulu; rantaian guru yang sudah menyalinnya tidak berubah.
          </p>
          <Button variant="outline" disabled={pending} onClick={() => run(() => setReferenceStatusAction(id, 'inactive'))}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <PauseCircle aria-hidden />} Nyahaktifkan untuk menyunting
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {status === 'draft' ? 'Draf ini belum kelihatan kepada guru.' : 'Rantaian ini tidak kelihatan kepada guru.'} Semak setiap perawi
            dan hubungan dengan teliti sebelum mengaktifkannya.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pending}
              onClick={() =>
                window.confirm('Aktifkan rantaian rujukan ini? Pastikan setiap perawi dan hubungan telah disemak satu demi satu.') &&
                run(() => setReferenceStatusAction(id, 'active'))
              }
            >
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : <CheckCircle2 aria-hidden />} Saya telah menyemak — Aktifkan
            </Button>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() =>
                window.confirm('Padam rantaian rujukan ini? Rantaian guru yang pernah menyalinnya tidak terjejas.') &&
                run(() => deleteReferenceChainAction(id), () => router.push('/admin/reference-chains'))
              }
            >
              <Trash2 aria-hidden /> Padam
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function ReferenceMetaForm({ id, initial, reference }: { id: string; initial: ReferenceChainMetaInput; reference: TeacherReferenceData }) {
  const router = useRouter();
  const [meta, setMeta] = useState(initial);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const errors = Object.fromEntries(Object.entries(result?.fieldErrors ?? {}).map(([k, v]) => [k, v?.[0] ?? '']));
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const res = await updateReferenceMetaAction(id, meta);
          setResult(res);
          if (res.ok) router.refresh();
        });
      }}
    >
      {result?.message ? <Alert variant={result.ok ? 'success' : 'destructive'}>{result.message}</Alert> : null}
      <MetaFields value={meta} onChange={setMeta} errors={errors} reference={reference} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null} Simpan
        </Button>
      </div>
    </form>
  );
}
