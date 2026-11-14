'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil, Plus } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/forms/fields';
import { EMPTY_NODE, NodeFields } from '@/components/sanad/editor/node-fields';
import { saveReferenceNodeAction } from '@/lib/actions/reference-actions';
import { ReferenceNodeSchema } from '@/lib/validations/reference';
import { issuesByPath } from '@/lib/validations/issues';
import type { SanadNodeInput } from '@/lib/validations/sanad';

export function ReferenceNodeEditor({ initial }: { initial?: { id: string; canonical_code: string; node: SanadNodeInput } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(initial?.canonical_code ?? '');
  const [node, setNode] = useState<SanadNodeInput>(initial?.node ?? { ...EMPTY_NODE, generation_category: 'Imam Qiraat' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return initial ? (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} aria-label={`Sunting ${initial.node.full_name_rumi}`}>
        <Pencil aria-hidden /> Sunting
      </Button>
    ) : (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus aria-hidden /> Tambah perawi rujukan
      </Button>
    );
  }
  return (
    <form
      noValidate
      className="w-full space-y-3 rounded-xl border bg-secondary/40 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const payload = { id: initial?.id, canonical_code: code, node };
        const parsed = ReferenceNodeSchema.safeParse(payload);
        if (!parsed.success) return setErrors(issuesByPath(parsed.error));
        setErrors({});
        startTransition(async () => {
          const res = await saveReferenceNodeAction(payload);
          if (res.ok) {
            setOpen(false);
            router.refresh();
          } else setMessage(res.message ?? 'Gagal.');
        });
      }}
    >
      {message ? <Alert variant="destructive">{message}</Alert> : null}
      <Alert variant="info">
        Perawi rujukan diterbitkan serta-merta sebagai rekod disahkan dan boleh dipilih oleh semua guru. Pastikan nama, tahun dan
        rujukan disemak dengan sumber ilmiah.
      </Alert>
      <TextField id="ref-code" label="Kod rujukan" required hint="Contoh: IMAM-ASIM" value={code} onChange={(e) => setCode(e.target.value)} error={errors.canonical_code} />
      <NodeFields value={node} onChange={setNode} errors={errors} prefix="node." />
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
