'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Link2, Loader2, Pencil, Plus, Replace, Trash2, UserMinus } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/forms/fields';
import { SanadGraphLazy as SanadGraph } from '@/components/sanad/sanad-graph-lazy';
import { NodePicker } from './node-picker';
import { NodeFields } from './node-fields';
import { EdgeFields, EMPTY_EDGE } from './edge-fields';
import {
  addShaykhAction,
  deleteEdgeAction,
  linkNodesAction,
  removeNodeFromChainAction,
  replaceNodeAction,
  updateEdgeAction,
  updateNodeAction,
} from '@/lib/actions/sanad-actions';
import { NodeChoiceSchema, SanadEdgeSchema, SanadNodeSchema, type NodeChoiceInput, type SanadEdgeInput, type SanadNodeInput } from '@/lib/validations/sanad';
import { issuesByPath } from '@/lib/validations/issues';
import type { ActionResult } from '@/lib/validations/auth';
import type { GraphEdgeData, GraphNodeData, SanadGraphData } from '@/lib/sanad/graph';

type Panel =
  | { kind: 'add-shaykh'; node: GraphNodeData }
  | { kind: 'link'; node: GraphNodeData }
  | { kind: 'edit-node'; node: GraphNodeData }
  | { kind: 'replace-node'; node: GraphNodeData }
  | { kind: 'edit-edge'; edge: GraphEdgeData }
  | null;

function nodeToInput(n: GraphNodeData): SanadNodeInput {
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

const isVerified = (n: GraphNodeData) => ['approved', 'published', 'submitted', 'under_review'].includes(n.verification_status ?? '');

function edgeToInput(e: GraphEdgeData): SanadEdgeInput {
  return {
    transmission_relationship: e.transmission_relationship ?? '',
    riwayat_context: e.riwayat_context ?? '',
    transmission_date_text: e.transmission_date_text ?? '',
    transmission_location: e.transmission_location ?? '',
    sequence_order: e.sequence_order ?? 1,
    supporting_evidence: e.supporting_evidence ?? '',
    notes: e.notes ?? '',
  };
}

export function SanadEditor({ chainId, graph, editable, title }: { chainId: string; graph: SanadGraphData; editable: boolean; title: string }) {
  const router = useRouter();
  const [panel, setPanel] = useState<Panel>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [choice, setChoice] = useState<NodeChoiceInput>({ mode: 'existing', node_id: '' });
  const [edge, setEdge] = useState<SanadEdgeInput>(EMPTY_EDGE);
  const [node, setNode] = useState<SanadNodeInput | null>(null);
  const [linkTarget, setLinkTarget] = useState('');

  function open(p: Panel) {
    setPanel(p);
    setErrors({});
    setResult(null);
    setChoice({ mode: 'existing', node_id: '' });
    setEdge(p?.kind === 'edit-edge' ? edgeToInput(p.edge) : EMPTY_EDGE);
    setNode(p?.kind === 'edit-node' ? nodeToInput(p.node) : null);
    setLinkTarget('');
  }

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      const res = await action();
      setResult(res);
      if (res.ok) {
        setPanel(null);
        router.refresh();
      } else if (res.fieldErrors) {
        setErrors(Object.fromEntries(Object.entries(res.fieldErrors).map(([k, v]) => [k, v?.[0] ?? ''])));
      }
    });
  }

  function validate(parts: Array<[string, { safeParse: (v: unknown) => { success: boolean; error?: unknown } }, unknown]>) {
    const all: Record<string, string> = {};
    for (const [prefix, schema, value] of parts) {
      const r = schema.safeParse(value);
      if (!r.success) {
        for (const [k, v] of Object.entries(issuesByPath(r.error as Parameters<typeof issuesByPath>[0]))) all[`${prefix}${k}`] = v;
      }
    }
    setErrors(all);
    return Object.keys(all).length === 0;
  }

  const nodeActions = (n: GraphNodeData) =>
    editable ? (
      <div className="flex flex-col gap-2 border-t pt-3">
        <Button size="sm" onClick={() => open({ kind: 'add-shaykh', node: n })}>
          <Plus aria-hidden /> Tambah guru kepada perawi ini
        </Button>
        <Button size="sm" variant="outline" onClick={() => open({ kind: 'link', node: n })}>
          <Link2 aria-hidden /> Sambung kepada murid dalam rantaian
        </Button>
        {!n.is_self ? (
          <>
            <Button size="sm" variant="outline" onClick={() => open({ kind: 'edit-node', node: n })}>
              <Pencil aria-hidden /> Betulkan nama / maklumat
            </Button>
            <Button size="sm" variant="outline" onClick={() => open({ kind: 'replace-node', node: n })}>
              <Replace aria-hidden /> Ganti dengan perawi lain
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                window.confirm(`Buang ${n.full_name_rumi} daripada rantaian ini? Hubungannya dalam rantaian ini akan dipadam.`) &&
                run(() => removeNodeFromChainAction(chainId, n.id))
              }
            >
              <UserMinus aria-hidden /> Buang daripada rantaian
            </Button>
          </>
        ) : null}
      </div>
    ) : null;

  const edgeActions = (e: GraphEdgeData) =>
    editable ? (
      <div className="flex flex-wrap gap-2 border-t pt-3">
        <Button size="sm" variant="outline" onClick={() => open({ kind: 'edit-edge', edge: e })}>
          <Pencil aria-hidden /> Sunting
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => window.confirm('Padam hubungan ini?') && run(() => deleteEdgeAction(chainId, e.id))}
        >
          <Trash2 aria-hidden /> Padam
        </Button>
      </div>
    ) : null;

  const linkOptions =
    panel?.kind === 'link'
      ? graph.nodes.filter((n) => n.id !== panel.node.id).map((n) => ({ value: n.id, label: n.full_name_rumi }))
      : [];

  return (
    <div className="space-y-4">
      {result?.message ? <Alert variant={result.ok ? 'success' : 'destructive'}>{result.message}</Alert> : null}
      {editable && graph.edges.length <= 1 ? (
        <Alert variant="info">
          Klik perawi dalam graf, kemudian pilih <strong>Tambah guru kepada perawi ini</strong> untuk menyambung rantaian ke atas. Jika
          seorang perawi mempunyai lebih daripada seorang guru, tambah kedua-duanya untuk membentuk cabang.
        </Alert>
      ) : null}

      <SanadGraph
        data={graph}
        mode="private"
        title={title}
        allowExport
        renderNodeActions={nodeActions}
        renderEdgeActions={edgeActions}
      />

      {panel ? (
        <section className="space-y-4 rounded-2xl border-2 border-primary/30 bg-card p-5 shadow-soft" aria-label="Penyunting">
          {panel.kind === 'add-shaykh' ? (
            <>
              <h3 className="font-semibold text-forest-900">Tambah guru kepada {panel.node.full_name_rumi}</h3>
              <NodePicker value={choice} onChange={setChoice} errors={errors} prefix="node." />
              <h4 className="text-sm font-semibold text-forest-900">Butiran hubungan</h4>
              <EdgeFields value={edge} onChange={setEdge} errors={errors} prefix="edge." />
            </>
          ) : null}
          {panel.kind === 'link' ? (
            <>
              <h3 className="font-semibold text-forest-900">Sambung {panel.node.full_name_rumi} sebagai guru kepada…</h3>
              <SelectField id="link-target" label="Murid" required options={linkOptions} value={linkTarget} onChange={(e) => setLinkTarget(e.target.value)} />
              <EdgeFields value={edge} onChange={setEdge} errors={errors} prefix="edge." />
            </>
          ) : null}
          {panel.kind === 'edit-node' && node ? (
            <>
              <h3 className="font-semibold text-forest-900">Betulkan perawi: {panel.node.full_name_rumi}</h3>
              {isVerified(panel.node) ? (
                <Alert variant="info">
                  Perawi ini telah disahkan. Pembetulan anda digunakan dalam rantaian ini sahaja dan akan disemak semula oleh pentadbir
                  apabila rantaian dihantar.
                </Alert>
              ) : null}
              <NodeFields value={node} onChange={setNode} errors={errors} prefix="node." />
            </>
          ) : null}
          {panel.kind === 'replace-node' ? (
            <>
              <h3 className="font-semibold text-forest-900">Ganti {panel.node.full_name_rumi} dengan perawi lain</h3>
              <p className="text-sm text-muted-foreground">
                Semua hubungan perawi ini dalam rantaian ini akan dipindahkan kepada perawi yang dipilih. Rantaian lain tidak terjejas.
              </p>
              <NodePicker value={choice} onChange={setChoice} errors={errors} prefix="node." />
            </>
          ) : null}
          {panel.kind === 'edit-edge' ? (
            <>
              <h3 className="font-semibold text-forest-900">Sunting hubungan</h3>
              <EdgeFields value={edge} onChange={setEdge} errors={errors} prefix="edge." />
            </>
          ) : null}

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="ghost" onClick={() => setPanel(null)}>
              Batal
            </Button>
            <Button
              disabled={pending}
              onClick={() => {
                if (panel.kind === 'add-shaykh') {
                  if (!validate([['node.', NodeChoiceSchema, choice], ['edge.', SanadEdgeSchema, edge]])) return;
                  run(() => addShaykhAction(chainId, panel.node.id, choice, edge));
                } else if (panel.kind === 'link') {
                  if (!linkTarget) return setErrors({ 'link-target': 'Pilih murid.' });
                  if (!validate([['edge.', SanadEdgeSchema, edge]])) return;
                  run(() => linkNodesAction(chainId, panel.node.id, linkTarget, edge));
                } else if (panel.kind === 'edit-node' && node) {
                  if (!validate([['node.', SanadNodeSchema, node]])) return;
                  run(() => updateNodeAction(chainId, panel.node.id, node));
                } else if (panel.kind === 'replace-node') {
                  if (!validate([['node.', NodeChoiceSchema, choice]])) return;
                  run(() => replaceNodeAction(chainId, panel.node.id, choice));
                } else if (panel.kind === 'edit-edge') {
                  if (!validate([['edge.', SanadEdgeSchema, edge]])) return;
                  run(() => updateEdgeAction(chainId, panel.edge.id, edge));
                }
              }}
            >
              {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              Simpan
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
