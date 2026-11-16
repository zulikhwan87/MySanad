'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FormSection } from '@/components/teacher/forms/form-shell';
import { ChainFields } from './chain-fields';
import { NodePicker } from './node-picker';
import { EdgeFields, EMPTY_EDGE } from './edge-fields';
import { createSanadChainAction } from '@/lib/actions/sanad-actions';
import { NewSanadChainSchema, type NodeChoiceInput, type SanadChainInput, type SanadEdgeInput } from '@/lib/validations/sanad';
import { issuesByPath } from '@/lib/validations/issues';
import type { TeacherReferenceData } from '@/types/teacher';

export function NewChainForm({
  reference,
  teacherId,
  chainHref = '/teacher/sanad',
}: {
  reference: TeacherReferenceData;
  /** Administrator creating a chain for this teacher. */
  teacherId?: string;
  /** Base path of the chain page; the new chain ID is appended. */
  chainHref?: string;
}) {
  const router = useRouter();
  const [chain, setChain] = useState<SanadChainInput>({
    title: '',
    qiraat_id: '',
    riwayat_id: '',
    tariq_id: '',
    transmission_method: '',
    ijazah_date: '',
    ijazah_location: '',
    public_notes: '',
    allow_public_graph_export: false,
  });
  const [shaykh, setShaykh] = useState<NodeChoiceInput>({ mode: 'existing', node_id: '' });
  const [edge, setEdge] = useState<SanadEdgeInput>({ ...EMPTY_EDGE });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const payload = { chain, shaykh, edge };
    const parsed = NewSanadChainSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(issuesByPath(parsed.error));
      setMessage('Sila semak medan yang bertanda.');
      return;
    }
    setErrors({});
    startTransition(async () => {
      const res = await createSanadChainAction(payload, teacherId);
      if (res.ok && res.id) router.push(`${chainHref}/${res.id}`);
      else {
        setMessage(res.message ?? 'Gagal mencipta rantaian.');
        if (res.fieldErrors) setErrors(Object.fromEntries(Object.entries(res.fieldErrors).map(([k, v]) => [k, v?.[0] ?? ''])));
      }
    });
  }

  return (
    <form noValidate onSubmit={submit} className="space-y-8">
      {message ? <Alert variant="destructive">{message}</Alert> : null}
      <FormSection title="1. Maklumat rantaian">
        <ChainFields value={chain} onChange={setChain} errors={errors} reference={reference} />
      </FormSection>
      <FormSection
        title="2. Guru yang memberi ijazah kepada anda"
        description="Mulakan dengan syeikh anda. Selepas itu, tambah guru-guru di atasnya dalam editor graf sehingga ke sumber yang didokumenkan."
      >
        <NodePicker value={shaykh} onChange={setShaykh} errors={Object.fromEntries(Object.entries(errors).map(([k, v]) => [k.replace(/^shaykh\./, ''), v]))} />
      </FormSection>
      <FormSection title="3. Butiran pengambilan anda daripada syeikh">
        <EdgeFields value={edge} onChange={setEdge} errors={Object.fromEntries(Object.entries(errors).map(([k, v]) => [k.replace(/^edge\./, ''), v]))} prefix="e-" />
      </FormSection>
      <div className="flex justify-end border-t pt-4">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          Cipta rantaian (draf)
        </Button>
      </div>
    </form>
  );
}
