'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Pencil, Plus, Replace, Trash2, UserMinus } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SanadGraphLazy as SanadGraph } from '@/components/sanad/sanad-graph-lazy';
import { NodePicker } from '@/components/sanad/editor/node-picker';
import { NodeFields } from '@/components/sanad/editor/node-fields';
import {
  addReferenceShaykhAction,
  correctReferenceNodeAction,
  removeReferenceLinkAction,
  removeReferenceNodeAction,
  replaceReferenceNodeAction,
} from '@/lib/actions/reference-chain-actions';
import { NodeChoiceSchema, SanadNodeSchema, type NodeChoiceInput, type SanadNodeInput } from '@/lib/validations/sanad';
import { issuesByPath } from '@/lib/validations/issues';
import type { ActionResult } from '@/lib/validations/auth';
import type { GraphEdgeData, GraphNodeData, SanadGraphData } from '@/lib/sanad/graph';

type Panel = { kind: 'add' | 'edit' | 'replace'; node: GraphNodeData } | null;

function toInput(n: GraphNodeData): SanadNodeInput {
  return {
    full_name_rumi: n.full_name_rumi,
    full_name_arabic: n.full_name_arabic ?? '',
    alternative_spellings: (n.alternative_spellings ?? []).join(', '),
    historical_title: n.historical_title ?? '',
    generation_category: (n.generation_category as SanadNodeInput['generation_category']) ?? '',
    birth_year_hijri: n.birth_year_hijri ?? '',
    death_year_hijri: n.death_year_hijri ?? '',
    birth_year_miladi: n.birth_year_miladi ?? '',
    death_year_miladi: n.death_year_miladi ?? '',
    country_or_region: n.country_or_region ?? '',
    biography: n.biography ?? '',
    scholarly_references: (n.scholarly_references ?? []).join('\n'),
  };
}

export function ReferenceChainEditor({
  id,
  rootId,
  graph,
  editable,
  title,
}: {
  id: string;
  rootId: string;
  graph: SanadGraphData;
  editable: boolean;
  title: string;
}) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const [choice, setChoice] = useState<NodeChoiceInput>({ mode: 'existing', node_id: '' });
  const [node, setNode] = useState<SanadNodeInput | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function open(p: Panel) {
    setPanel(p);
    setErrors({});
    setResult(null);
    setChoice({ mode: 'existing', node_id: '' });
    setNode(p?.kind === 'edit' ? toInput(p.node) : null);
  }

  function run(fn: () => Promise<ActionResult>) {
    startTransition(async () => {
      const res = await fn();
      setResult(res);
      if (res.ok) {
        setPanel(null);
        router.refresh();
      } else if (res.fieldErrors) {
        setErrors(Object.fromEntries(Object.entries(res.fieldErrors).map(([k, v]) => [k, v?.[0] ?? ''])));
      }
    });
  }

  function check(prefix: string, schema: { safeParse: (v: unknown) => { success: boolean; error?: unknown } }, value: unknown) {
    const r = schema.safeParse(value);
    if (r.success) return true;
    setErrors(Object.fromEntries(Object.entries(issuesByPath(r.error as Parameters<typeof issuesByPath>[0])).map(([k, v]) => [`${prefix}${k}`, v])));
    return false;
  }

  const nodeActions = (n: GraphNodeData) =>
    editable ? (
      <div className="flex flex-col gap-2 border-t pt-3">
        <Button size="sm" onClick={() => open({ kind: 'add', node: n })}>
          <Plus aria-hidden /> Tambah guru kepada perawi ini
        </Button>
        <Button size="sm" variant="outline" onClick={() => open({ kind: 'edit', node: n })}>
          <Pencil aria-hidden /> Betulkan nama / maklumat
        </Button>
        <Button size="sm" variant="outline" onClick={() => open({ kind: 'replace', node: n })}>
          <Replace aria-hidden /> Ganti dengan perawi lain
        </Button>
        {n.id !== rootId ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => window.confirm(`Buang ${n.full_name_rumi} daripada rantaian rujukan ini?`) && run(() => removeReferenceNodeAction(id, n.id))}
          >
            <UserMinus aria-hidden /> Buang daripada rantaian
          </Button>
        ) : null}
      </div>
    ) : null;

  const edgeActions = (e: GraphEdgeData) =>
    editable ? (
      <div className="border-t pt-3">
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => window.confirm('Padam hubungan ini?') && run(() => removeReferenceLinkAction(id, e.id))}>
          <Trash2 aria-hidden /> Padam hubungan
        </Button>
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      {result?.message ? <Alert variant={result.ok ? 'success' : 'destructive'}>{result.message}</Alert> : null}
      {editable && graph.edges.length === 0 ? (
        <Alert variant="info">
          Klik perawi permulaan dalam graf, kemudian pilih <strong>Tambah guru kepada perawi ini</strong>. Ulang ke atas satu demi satu.
        </Alert>
      ) : null}
      <SanadGraph data={graph} mode="private" title={title} allowExport={false} renderNodeActions={nodeActions} renderEdgeActions={edgeActions} />

      {panel ? (
        <section className="space-y-4 rounded-2xl border-2 border-primary/30 bg-card p-5 shadow-soft" aria-label="Penyunting rujukan">
          {panel.kind === 'add' ? (
            <>
              <h3 className="font-semibold text-forest-900">Tambah guru kepada {panel.node.full_name_rumi}</h3>
              <NodePicker value={choice} onChange={setChoice} errors={errors} prefix="node." />
            </>
          ) : null}
          {panel.kind === 'edit' && node ? (
            <>
              <h3 className="font-semibold text-forest-900">Betulkan perawi: {panel.node.full_name_rumi}</h3>
              <p className="text-sm text-muted-foreground">
                Jika perawi ini juga digunakan oleh rantaian guru atau rujukan lain, pembetulan digunakan dalam rantaian rujukan ini sahaja.
              </p>
              <NodeFields value={node} onChange={setNode} errors={errors} prefix="node." />
            </>
          ) : null}
          {panel.kind === 'replace' ? (
            <>
              <h3 className="font-semibold text-forest-900">Ganti {panel.node.full_name_rumi} dengan perawi lain</h3>
              <NodePicker value={choice} onChange={setChoice} errors={errors} prefix="node." />
            </>
          ) : null}
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="ghost" onClick={() => setPanel(null)}>
              Batal
            </Button>
            <Button
              disabled={pending}
              onClick={() => {
                if (panel.kind === 'edit' && node) {
                  if (check('node.', SanadNodeSchema, node)) run(() => correctReferenceNodeAction(id, panel.node.id, node));
                } else if (check('node.', NodeChoiceSchema, choice)) {
                  run(() =>
                    panel.kind === 'add' ? addReferenceShaykhAction(id, panel.node.id, choice) : replaceReferenceNodeAction(id, panel.node.id, choice),
                  );
                }
              }}
            >
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null} Simpan
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
