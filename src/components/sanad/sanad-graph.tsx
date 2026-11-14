'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Download, ExternalLink, FileJson, ListTree, Maximize2, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useReducedMotion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SanadNodeCard, type LabelMode, type SanadFlowNode } from './sanad-node';
import { exportGraphPng, exportJson } from './graph-export';
import {
  NODE_WIDTH,
  downstream,
  filterByChains,
  graphExportJson,
  layoutGraph,
  searchGraphNodes,
  upstream,
  type GraphEdgeData,
  type GraphNodeData,
  type SanadGraphData,
} from '@/lib/sanad/graph';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/client';
import { fmt } from '@/lib/i18n/dictionaries';

const nodeTypes = { sanad: SanadNodeCard };

type Selection = { kind: 'node'; id: string } | { kind: 'edge'; id: string } | null;

export interface SanadGraphProps {
  data: SanadGraphData;
  mode: 'public' | 'private';
  title: string;
  allowExport: boolean;
  height?: number;
  /** Private mode: extra actions shown in the details panel. */
  renderNodeActions?: (node: GraphNodeData) => React.ReactNode;
  renderEdgeActions?: (edge: GraphEdgeData) => React.ReactNode;
}

const selectClass = 'h-9 rounded-lg border border-input bg-card px-2 text-sm';

function Inner({ data, mode, title, allowExport, height = 560, renderNodeActions, renderEdgeActions }: SanadGraphProps) {
  const { t } = useI18n();
  const flow = useReactFlow();
  const reduceMotion = useReducedMotion();
  const [labelMode, setLabelMode] = useState<LabelMode>('both');
  const [query, setQuery] = useState('');
  const [matchIndex, setMatchIndex] = useState(0);
  const [selection, setSelection] = useState<Selection>(null);
  const [chainFocus, setChainFocus] = useState('');
  const [qiraat, setQiraat] = useState('');
  const [riwayat, setRiwayat] = useState('');
  const [showList, setShowList] = useState(false);

  const qiraatOptions = useMemo(
    () => Array.from(new Map(data.chains.filter((c) => c.qiraat_id).map((c) => [c.qiraat_id!, c.qiraat ?? ''])).entries()),
    [data.chains],
  );
  const riwayatOptions = useMemo(
    () =>
      Array.from(
        new Map(
          data.chains.filter((c) => c.riwayat_id && (!qiraat || c.qiraat_id === qiraat)).map((c) => [c.riwayat_id!, c.riwayat ?? '']),
        ).entries(),
      ),
    [data.chains, qiraat],
  );

  const visible = useMemo(
    () => filterByChains(data, (c) => (!qiraat || c.qiraat_id === qiraat) && (!riwayat || c.riwayat_id === riwayat)),
    [data, qiraat, riwayat],
  );
  // In private mode a lone self-node (no edges yet) should still be shown.
  const nodesForLayout = mode === 'private' && visible.edges.length === 0 ? data.nodes : visible.nodes;
  const positions = useMemo(() => layoutGraph(nodesForLayout, visible.edges), [nodesForLayout, visible.edges]);
  const matches = useMemo(() => searchGraphNodes(nodesForLayout, query), [nodesForLayout, query]);

  const highlight = useMemo(() => {
    if (selection?.kind === 'node') {
      const up = upstream(selection.id, visible.edges);
      const down = downstream(selection.id, visible.edges);
      return { up, down, edges: new Set([...up.edges, ...down.edges]) };
    }
    if (chainFocus) {
      const edges = visible.edges.filter((e) => e.chain_id === chainFocus);
      return {
        up: { nodes: new Set(edges.flatMap((e) => [e.source, e.target])), edges: new Set(edges.map((e) => e.id)) },
        down: { nodes: new Set<string>(), edges: new Set<string>() },
        edges: new Set(edges.map((e) => e.id)),
      };
    }
    return null;
  }, [selection, chainFocus, visible.edges]);

  const nodes: SanadFlowNode[] = useMemo(
    () =>
      nodesForLayout.map((n) => {
        const p = positions.get(n.id) ?? { x: 0, y: 0 };
        let h: SanadFlowNode['data']['highlight'] = null;
        if (selection?.kind === 'node' && selection.id === n.id) h = 'focus';
        else if (highlight?.up.nodes.has(n.id)) h = 'up';
        else if (highlight?.down.nodes.has(n.id)) h = 'down';
        else if (matches.includes(n.id)) h = 'match';
        return {
          id: n.id,
          type: 'sanad',
          position: { x: p.x, y: p.y },
          data: { ...n, labelMode, highlight: h, dimmed: Boolean(highlight) && h === null, showStatus: mode === 'private' },
          draggable: false,
        };
      }),
    [nodesForLayout, positions, selection, highlight, matches, labelMode, mode],
  );

  const edges: Edge[] = useMemo(
    () =>
      visible.edges.map((e) => {
        const on = highlight?.edges.has(e.id);
        const isUp = highlight?.up.edges.has(e.id);
        const unapproved = mode === 'private' && e.verification_status && !['approved', 'published'].includes(e.verification_status);
        const color = on ? (isUp ? '#c4973a' : '#059669') : '#8dbfa0';
        const isSelected = selection?.kind === 'edge' && selection.id === e.id;
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          type: 'smoothstep',
          markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
          style: {
            stroke: isSelected ? '#225339' : color,
            strokeWidth: on || isSelected ? 2.5 : 1.5,
            strokeDasharray: unapproved ? '6 4' : undefined,
            opacity: highlight && !on ? 0.25 : 1,
          },
          label: isSelected ? (e.transmission_relationship ?? undefined) : undefined,
          labelStyle: { fontSize: 11 },
          ariaLabel: `Hubungan periwayatan`,
        };
      }),
    [visible.edges, highlight, selection, mode],
  );

  const nodeById = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data.nodes]);
  const selectedNode = selection?.kind === 'node' ? nodeById.get(selection.id) : undefined;
  const selectedEdge = selection?.kind === 'edge' ? data.edges.find((e) => e.id === selection.id) : undefined;

  const focusNode = useCallback(
    (id: string) => {
      const p = positions.get(id);
      if (!p) return;
      setSelection({ kind: 'node', id });
      void flow.setCenter(p.x + NODE_WIDTH / 2, p.y + 36, { zoom: 1.1, duration: reduceMotion ? 0 : 400 });
    },
    [positions, flow, reduceMotion],
  );

  function onSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter' || matches.length === 0) return;
    e.preventDefault();
    const next = matches[matchIndex % matches.length];
    setMatchIndex((i) => i + 1);
    focusNode(next);
  }

  const empty = nodesForLayout.length === 0;
  const exportTitle = data.chains.length === 1 ? data.chains[0].title : title;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2" role="toolbar" aria-label={t.graph.toolbar}>
        <div className="relative min-w-[200px] flex-1">
          <label htmlFor="graph-search" className="sr-only">
            {t.graph.searchLabel}
          </label>
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            id="graph-search"
            type="search"
            dir="auto"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setMatchIndex(0);
            }}
            onKeyDown={onSearchKey}
            placeholder={t.graph.searchPlaceholder}
            className="h-9 w-full rounded-lg border border-input bg-card ps-8 pe-16 text-sm"
          />
          {query ? (
            <span className="absolute end-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground" aria-live="polite">
              {fmt(t.graph.matches, { n: matches.length })}
            </span>
          ) : null}
        </div>
        <label className="sr-only" htmlFor="graph-labels">
          {t.graph.labels}
        </label>
        <select id="graph-labels" className={selectClass} value={labelMode} onChange={(e) => setLabelMode(e.target.value as LabelMode)}>
          <option value="both">{t.graph.labelBoth}</option>
          <option value="rumi">{t.graph.labelRumi}</option>
          <option value="arab">{t.graph.labelArab}</option>
        </select>
        {qiraatOptions.length > 1 || riwayatOptions.length > 1 ? (
          <>
            <label className="sr-only" htmlFor="graph-qiraat">
              {t.filters.qiraat}
            </label>
            <select
              id="graph-qiraat"
              className={selectClass}
              value={qiraat}
              onChange={(e) => {
                setQiraat(e.target.value);
                setRiwayat('');
                setSelection(null);
              }}
            >
              <option value="">{t.filters.allQiraat}</option>
              {qiraatOptions.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="graph-riwayat">
              {t.filters.riwayat}
            </label>
            <select id="graph-riwayat" className={selectClass} value={riwayat} onChange={(e) => (setRiwayat(e.target.value), setSelection(null))}>
              <option value="">{t.filters.allRiwayat}</option>
              {riwayatOptions.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </>
        ) : null}
        {visible.chains.length > 1 ? (
          <>
            <label className="sr-only" htmlFor="graph-chain">
              {t.graph.highlightChain}
            </label>
            <select
              id="graph-chain"
              className={selectClass}
              value={chainFocus}
              onChange={(e) => {
                setChainFocus(e.target.value);
                setSelection(null);
              }}
            >
              <option value="">{t.graph.highlightChain}</option>
              {visible.chains.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                  {c.teacher_name ? ` · ${c.teacher_name}` : ''}
                </option>
              ))}
            </select>
          </>
        ) : null}
        <Button variant="outline" size="sm" onClick={() => void flow.fitView({ padding: 0.15, duration: reduceMotion ? 0 : 400 })}>
          <Maximize2 aria-hidden /> {t.graph.fit}
        </Button>
        {selection || chainFocus ? (
          <Button variant="ghost" size="sm" onClick={() => (setSelection(null), setChainFocus(''))}>
            <X aria-hidden /> {t.graph.clear}
          </Button>
        ) : null}
        {allowExport && !empty ? (
          <>
            <Button variant="outline" size="sm" onClick={() => void exportGraphPng(nodes, exportTitle)}>
              <Download aria-hidden /> PNG
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportJson(graphExportJson(visible, mode), exportTitle)}>
              <FileJson aria-hidden /> JSON
            </Button>
          </>
        ) : null}
        <Button variant="ghost" size="sm" aria-pressed={showList} onClick={() => setShowList((v) => !v)}>
          <ListTree aria-hidden /> {showList ? t.graph.graphView : t.graph.listView}
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_300px]">
        {showList ? (
          <EdgeList data={visible} nodeById={nodeById} onSelect={(id) => setSelection({ kind: 'edge', id })} />
        ) : (
          <div
            className="sanad-flow overflow-hidden rounded-2xl border bg-secondary/30"
            style={{ height }}
            role="figure"
            aria-label={fmt(t.graph.figure, { nodes: visible.nodes.length, edges: visible.edges.length })}
          >
            {empty ? (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                {t.graph.empty}
              </div>
            ) : (
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                fitView
                fitViewOptions={{ padding: 0.15 }}
                minZoom={0.1}
                maxZoom={2}
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable
                onNodeClick={(_, n) => setSelection({ kind: 'node', id: n.id })}
                onEdgeClick={(_, e) => setSelection({ kind: 'edge', id: e.id })}
                onPaneClick={() => setSelection(null)}
                proOptions={{ hideAttribution: false }}
              >
                <Background gap={22} size={1} color="#bad9c5" />
                <Controls showInteractive={false} position="bottom-right" />
                <MiniMap pannable zoomable nodeColor={(n) => ((n.data as { is_self?: boolean }).is_self ? '#d4ae52' : '#5c9e76')} className="!hidden sm:!block" />
              </ReactFlow>
            )}
          </div>
        )}

        <aside className="rounded-2xl border bg-card p-4 text-sm shadow-soft" aria-live="polite" aria-label={t.graph.details}>
          {selectedNode ? (
            <NodeDetails node={selectedNode} mode={mode} actions={renderNodeActions?.(selectedNode)} />
          ) : selectedEdge ? (
            <EdgeDetails edge={selectedEdge} nodeById={nodeById} mode={mode} actions={renderEdgeActions?.(selectedEdge)} />
          ) : (
            <div className="space-y-2 text-muted-foreground">
              <p className="font-medium text-forest-900">{t.graph.howTitle}</p>
              <ul className="list-disc space-y-1 ps-4">
                <li>{t.graph.how1}</li>
                <li>{t.graph.how2}</li>
                <li>{t.graph.how3}</li>
              </ul>
              {mode === 'private' ? <p>{t.graph.dashed}</p> : null}
            </div>
          )}
        </aside>
      </div>
      <p className="text-xs text-muted-foreground">{t.graph.disclaimer}</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-forest-900">{children}</dd>
    </div>
  );
}

function NodeDetails({ node, mode, actions }: { node: GraphNodeData; mode: 'public' | 'private'; actions?: React.ReactNode }) {
  const { t } = useI18n();
  const lifespan = [
    node.birth_year_hijri || node.death_year_hijri ? `${node.birth_year_hijri ?? '?'} – ${node.death_year_hijri ?? '?'} H` : null,
    node.birth_year_miladi || node.death_year_miladi ? `${node.birth_year_miladi ?? '?'} – ${node.death_year_miladi ?? '?'} M` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="space-y-3">
      <div>
        {node.historical_title ? <p className="text-xs text-muted-foreground">{node.historical_title}</p> : null}
        <h3 className="font-semibold text-forest-900">{node.full_name_rumi}</h3>
        {node.full_name_arabic ? (
          <p lang="ar" dir="rtl" className="arabic text-base text-forest-700">
            {node.full_name_arabic}
          </p>
        ) : null}
        <div className="mt-1 flex flex-wrap gap-1">
          {node.is_self ? <Badge variant="gold">{t.graph.you}</Badge> : null}
          {mode === 'private' && node.verification_status ? <Badge variant="outline">{node.verification_status}</Badge> : null}
        </div>
      </div>
      <dl className="space-y-2">
        <Row label={t.graph.category}>{node.generation_category}</Row>
        <Row label={t.graph.lifespan}>{lifespan}</Row>
        <Row label={t.graph.region}>{node.country_or_region}</Row>
        <Row label={t.graph.otherSpellings}>{node.alternative_spellings?.length ? node.alternative_spellings.join(', ') : null}</Row>
        <Row label={t.graph.biography}>{node.biography ? <span className="whitespace-pre-line">{node.biography}</span> : null}</Row>
        <Row label={t.graph.references}>
          {node.scholarly_references?.length ? (
            <ul className="list-disc ps-4">
              {node.scholarly_references.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : null}
        </Row>
      </dl>
      {mode === 'public' && node.linked_teacher_id ? (
        <Link href={`/directory/${node.linked_teacher_id}`} className="inline-flex items-center gap-1 text-primary hover:underline">
          {t.graph.viewTeacher} <ExternalLink className="size-3.5" aria-hidden />
        </Link>
      ) : null}
      {actions}
    </div>
  );
}

function EdgeDetails({
  edge,
  nodeById,
  mode,
  actions,
}: {
  edge: GraphEdgeData;
  nodeById: Map<string, GraphNodeData>;
  mode: 'public' | 'private';
  actions?: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-forest-900">{t.graph.relationship}</h3>
      <dl className="space-y-2">
        <Row label={t.graph.giver}>{nodeById.get(edge.source)?.full_name_rumi}</Row>
        <Row label={t.graph.receiver}>{nodeById.get(edge.target)?.full_name_rumi}</Row>
        <Row label={t.graph.method}>{edge.transmission_relationship}</Row>
        <Row label={t.graph.context}>{edge.riwayat_context}</Row>
        <Row label={t.graph.date}>{edge.transmission_date_text}</Row>
        <Row label={t.graph.place}>{edge.transmission_location}</Row>
        {mode === 'private' ? (
          <>
            <Row label={t.graph.status}>{edge.verification_status}</Row>
            <Row label={t.graph.evidence}>{edge.supporting_evidence}</Row>
            <Row label={t.graph.notes}>{edge.notes}</Row>
          </>
        ) : null}
      </dl>
      {actions}
    </div>
  );
}

function EdgeList({ data, nodeById, onSelect }: { data: SanadGraphData; nodeById: Map<string, GraphNodeData>; onSelect: (id: string) => void }) {
  const chains = data.chains.length ? data.chains : [{ id: '', title: 'Rantaian' }];
  return (
    <div className={cn('max-h-[560px] space-y-4 overflow-auto rounded-2xl border bg-card p-4')}>
      {chains.map((c) => {
        const list = data.edges.filter((e) => !c.id || e.chain_id === c.id);
        if (!list.length) return null;
        return (
          <section key={c.id || 'all'} aria-label={c.title}>
            <h3 className="mb-2 font-semibold text-forest-900">{c.title}</h3>
            <ol className="space-y-1 text-sm">
              {list.map((e) => (
                <li key={e.id}>
                  <button type="button" onClick={() => onSelect(e.id)} className="text-start hover:text-primary hover:underline">
                    {nodeById.get(e.source)?.full_name_rumi} → {nodeById.get(e.target)?.full_name_rumi}
                    {e.transmission_relationship ? <span className="text-muted-foreground"> ({e.transmission_relationship})</span> : null}
                  </button>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

export function SanadGraph(props: SanadGraphProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}
