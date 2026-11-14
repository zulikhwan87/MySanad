import { normalizeSearchText } from '@/lib/text/normalize';

/** Edge direction: source = transmitting shaykh, target = receiving student. */
export interface GraphNodeData {
  id: string;
  full_name_rumi: string;
  full_name_arabic: string | null;
  alternative_spellings?: string[] | null;
  historical_title?: string | null;
  generation_category?: string | null;
  birth_year_hijri?: string | null;
  death_year_hijri?: string | null;
  birth_year_miladi?: number | null;
  death_year_miladi?: number | null;
  country_or_region?: string | null;
  biography?: string | null;
  scholarly_references?: string[] | null;
  verification_status?: string;
  linked_teacher_id?: string | null;
  /** Private mode only. */
  is_self?: boolean;
  is_mine?: boolean;
}

export interface GraphEdgeData {
  id: string;
  chain_id: string;
  source: string;
  target: string;
  sequence_order?: number;
  transmission_relationship?: string | null;
  riwayat_context?: string | null;
  transmission_date_text?: string | null;
  transmission_location?: string | null;
  verification_status?: string;
  /** Private mode only. */
  supporting_evidence?: string | null;
  notes?: string | null;
}

export interface GraphChainData {
  id: string;
  title: string;
  sanad_code?: string;
  teacher_id?: string;
  teacher_name?: string;
  qiraat?: string;
  riwayat?: string;
  qiraat_id?: string;
  riwayat_id?: string;
  tariq?: string | null;
  verification_status?: string;
  allow_export?: boolean;
  is_demo_record?: boolean;
}

export interface SanadGraphData {
  chains: GraphChainData[];
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
}

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 72;
const GAP_X = 40;
const GAP_Y = 70;

/**
 * Layered top-down layout without external libraries.
 * rank = longest path from any root (a shaykh with no recorded teacher), so the
 * Prophet ﷺ / earliest transmitters sit at the top and the teacher at the bottom.
 * Within a rank, nodes are ordered by the average x of their parents (barycentre).
 */
export function layoutGraph(nodes: GraphNodeData[], edges: GraphEdgeData[]): Map<string, { x: number; y: number; rank: number }> {
  const ids = new Set(nodes.map((n) => n.id));
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  for (const id of ids) {
    parents.set(id, []);
    children.set(id, []);
  }
  for (const e of edges) {
    if (!ids.has(e.source) || !ids.has(e.target) || e.source === e.target) continue;
    parents.get(e.target)!.push(e.source);
    children.get(e.source)!.push(e.target);
  }

  // Longest-path ranking (Kahn's algorithm; any cycle remnants are placed after the rest).
  const rank = new Map<string, number>();
  const indegree = new Map([...ids].map((id) => [id, parents.get(id)!.length]));
  const queue = [...ids].filter((id) => indegree.get(id) === 0);
  for (const id of queue) rank.set(id, 0);
  while (queue.length) {
    const id = queue.shift()!;
    for (const child of children.get(id)!) {
      rank.set(child, Math.max(rank.get(child) ?? 0, rank.get(id)! + 1));
      indegree.set(child, indegree.get(child)! - 1);
      if (indegree.get(child) === 0) queue.push(child);
    }
  }
  const maxRank = Math.max(0, ...rank.values());
  for (const id of ids) if (!rank.has(id)) rank.set(id, maxRank + 1);

  const name = new Map(nodes.map((n) => [n.id, n.full_name_rumi]));
  const layers = new Map<number, string[]>();
  for (const [id, r] of rank) layers.set(r, [...(layers.get(r) ?? []), id]);

  const positions = new Map<string, { x: number; y: number; rank: number }>();
  const ranks = [...layers.keys()].sort((a, b) => a - b);
  for (const r of ranks) {
    const layer = layers.get(r)!;
    const score = (id: string) => {
      const xs = parents.get(id)!.map((p) => positions.get(p)?.x).filter((x): x is number => x !== undefined);
      return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : Number.POSITIVE_INFINITY;
    };
    layer.sort((a, b) => score(a) - score(b) || (name.get(a) ?? '').localeCompare(name.get(b) ?? ''));
    const width = layer.length * NODE_WIDTH + (layer.length - 1) * GAP_X;
    layer.forEach((id, i) => {
      positions.set(id, { x: i * (NODE_WIDTH + GAP_X) - width / 2, y: r * (NODE_HEIGHT + GAP_Y), rank: r });
    });
  }
  return positions;
}

export interface PathHighlight {
  nodes: Set<string>;
  edges: Set<string>;
}

/** All transmitters above a node (its sanad up to the earliest recorded source). */
export function upstream(nodeId: string, edges: GraphEdgeData[]): PathHighlight {
  return walk(nodeId, edges, 'up');
}

/** Everyone who received from a node (directly or indirectly). */
export function downstream(nodeId: string, edges: GraphEdgeData[]): PathHighlight {
  return walk(nodeId, edges, 'down');
}

function walk(start: string, edges: GraphEdgeData[], dir: 'up' | 'down'): PathHighlight {
  const nodes = new Set([start]);
  const hit = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const current = stack.pop()!;
    for (const e of edges) {
      const from = dir === 'up' ? e.target : e.source;
      const to = dir === 'up' ? e.source : e.target;
      if (from !== current) continue;
      hit.add(e.id);
      if (!nodes.has(to)) {
        nodes.add(to);
        stack.push(to);
      }
    }
  }
  return { nodes, edges: hit };
}

/** Restrict a graph to some chains (by qiraat/riwayat filter or explicit selection). */
export function filterByChains(graph: SanadGraphData, keep: (chain: GraphChainData) => boolean): SanadGraphData {
  const chains = graph.chains.filter(keep);
  const chainIds = new Set(chains.map((c) => c.id));
  const edges = graph.edges.filter((e) => chainIds.has(e.chain_id));
  const used = new Set(edges.flatMap((e) => [e.source, e.target]));
  return { chains, edges, nodes: graph.nodes.filter((n) => used.has(n.id)) };
}

/** Diacritic- and spelling-tolerant node search (Rumi, Arabic, alternative spellings). */
export function searchGraphNodes(nodes: GraphNodeData[], query: string): string[] {
  const q = normalizeSearchText(query);
  if (!q) return [];
  return nodes
    .filter((n) =>
      normalizeSearchText([n.full_name_rumi, n.full_name_arabic, ...(n.alternative_spellings ?? [])].join(' ')).includes(q),
    )
    .map((n) => n.id);
}

export const GRAPH_DISCLAIMER =
  'Graf ini mendokumenkan hubungan periwayatan yang diserahkan oleh guru dan disemak oleh pentadbir MySanad. Ia bukan pengisytiharan kesahihan sanad atau pentauliahan ilmiah.';

/** JSON export containing only what was rendered (already public in public mode). */
export function graphExportJson(graph: SanadGraphData, mode: 'public' | 'private'): string {
  const strip = mode === 'public';
  return JSON.stringify(
    {
      source: 'MySanad',
      exported_at: new Date().toISOString(),
      disclaimer: GRAPH_DISCLAIMER,
      edge_direction: 'source = shaykh (pemberi), target = murid (penerima)',
      chains: graph.chains,
      nodes: strip ? graph.nodes.map(({ is_mine: _m, is_self: _s, ...n }) => n) : graph.nodes,
      edges: strip ? graph.edges.map(({ supporting_evidence: _e, notes: _n, ...e }) => e) : graph.edges,
    },
    null,
    2,
  );
}
