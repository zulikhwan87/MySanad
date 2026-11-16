import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';
import type { GraphEdgeData, GraphNodeData, SanadGraphData } from '@/lib/sanad/graph';

export type ReferenceChainStatus = 'draft' | 'active' | 'inactive';

export interface ReferenceChainSummary {
  id: string;
  title: string;
  status: ReferenceChainStatus;
  qiraat: string | null;
  riwayat: string | null;
  riwayat_id: string | null;
  tariq: string | null;
  root_name: string;
  link_count: number;
  updated_at: string;
}

export interface ReferenceChainDetail extends ReferenceChainSummary {
  qiraat_id: string | null;
  tariq_id: string | null;
  notes: string | null;
  root_node_id: string;
  activated_at: string | null;
  graph: SanadGraphData;
}

/** A perawi in an active reference, listed from the starting perawi upwards. */
export interface ReferencePerawi {
  id: string;
  name: string;
  arabic: string | null;
  depth: number;
}

export interface ActiveReference {
  id: string;
  title: string;
  riwayat_id: string | null;
  riwayat: string | null;
  tariq: string | null;
  perawi: ReferencePerawi[];
  links: Array<{ source: string; target: string }>;
}

const NODE_FIELDS =
  'id, full_name_rumi, full_name_arabic, alternative_spellings, historical_title, generation_category, birth_year_hijri, death_year_hijri, birth_year_miladi, death_year_miladi, country_or_region, biography, scholarly_references, verification_status, linked_teacher_id';

type ChainRow = {
  id: string;
  title: string;
  status: ReferenceChainStatus;
  qiraat_id: string | null;
  riwayat_id: string | null;
  tariq_id: string | null;
  notes: string | null;
  root_node_id: string;
  activated_at: string | null;
  updated_at: string;
  qiraat: { title_rumi: string } | null;
  riwayat: { full_label_rumi: string } | null;
  tariq: { name_rumi: string } | null;
  root: { full_name_rumi: string } | null;
  links: Array<{ count: number }>;
};

const SELECT =
  'id, title, status, qiraat_id, riwayat_id, tariq_id, notes, root_node_id, activated_at, updated_at, qiraat:qiraat_types(title_rumi), riwayat:riwayat_types(full_label_rumi), tariq:tariq_types(name_rumi), root:sanad_nodes!reference_chains_root_node_id_fkey(full_name_rumi), links:reference_chain_links(count)';

function summary(r: ChainRow): ReferenceChainSummary {
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    qiraat: r.qiraat?.title_rumi ?? null,
    riwayat: r.riwayat?.full_label_rumi ?? null,
    riwayat_id: r.riwayat_id,
    tariq: r.tariq?.name_rumi ?? null,
    root_name: r.root?.full_name_rumi ?? '—',
    link_count: r.links?.[0]?.count ?? 0,
    updated_at: r.updated_at,
  };
}

export async function listReferenceChains(): Promise<ReferenceChainSummary[]> {
  const { data, error } = await createServerSupabase().from('reference_chains').select(SELECT).order('updated_at', { ascending: false });
  if (error) throw new Error(`[reference-chains] ${error.message}`);
  return ((data ?? []) as unknown as ChainRow[]).map(summary);
}

export async function getReferenceChain(id: string): Promise<ReferenceChainDetail | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase.from('reference_chains').select(SELECT).eq('id', id).maybeSingle();
  if (error) throw new Error(`[reference-chain] ${error.message}`);
  if (!data) return null;
  const row = data as unknown as ChainRow;
  const { data: links, error: linkError } = await supabase
    .from('reference_chain_links')
    .select('id, source_node_id, target_node_id')
    .eq('reference_chain_id', id);
  if (linkError) throw new Error(`[reference-links] ${linkError.message}`);
  const nodeIds = Array.from(new Set([row.root_node_id, ...(links ?? []).flatMap((l) => [l.source_node_id, l.target_node_id])]));
  const { data: nodes, error: nodeError } = await supabase.from('sanad_nodes').select(NODE_FIELDS).in('id', nodeIds);
  if (nodeError) throw new Error(`[reference-nodes] ${nodeError.message}`);
  const graph: SanadGraphData = {
    chains: [{ id, title: row.title, riwayat: row.riwayat?.full_label_rumi, qiraat: row.qiraat?.title_rumi }],
    nodes: ((nodes ?? []) as GraphNodeData[]).map((n) => ({ ...n, full_name_arabic: n.full_name_arabic || null, is_self: false, is_mine: true })),
    edges: (links ?? []).map(
      (l): GraphEdgeData => ({ id: l.id as string, chain_id: id, source: l.source_node_id as string, target: l.target_node_id as string }),
    ),
  };
  return { ...summary(row), qiraat_id: row.qiraat_id, tariq_id: row.tariq_id, notes: row.notes, root_node_id: row.root_node_id, activated_at: row.activated_at, graph };
}

/** Lists perawi from the starting perawi upwards (breadth-first), so the nearest come first. */
export function orderUpwards(rootId: string, links: Array<{ source_node_id: string; target_node_id: string }>) {
  const depth = new Map<string, number>([[rootId, 0]]);
  const queue = [rootId];
  while (queue.length) {
    const current = queue.shift()!;
    for (const l of links) {
      if (l.target_node_id === current && !depth.has(l.source_node_id)) {
        depth.set(l.source_node_id, depth.get(current)! + 1);
        queue.push(l.source_node_id);
      }
    }
  }
  return depth;
}

/** Active references for the teacher's editor; empty when the feature is switched off (enforced in SQL). */
export async function getActiveReferences(): Promise<ActiveReference[]> {
  const supabase = createServerSupabase();
  // Administrators can read every reference; honour the switch for them too.
  const { data: enabled } = await supabase.rpc('reference_chains_enabled');
  if (enabled !== true) return [];
  const { data, error } = await supabase
    .from('reference_chains')
    .select('id, title, riwayat_id, root_node_id, riwayat:riwayat_types(full_label_rumi), tariq:tariq_types(name_rumi), links:reference_chain_links(source_node_id, target_node_id)')
    .eq('status', 'active')
    .order('title');
  if (error || !data?.length) return [];
  const rows = data as unknown as Array<{
    id: string;
    title: string;
    riwayat_id: string | null;
    root_node_id: string;
    riwayat: { full_label_rumi: string } | null;
    tariq: { name_rumi: string } | null;
    links: Array<{ source_node_id: string; target_node_id: string }>;
  }>;
  const ids = Array.from(new Set(rows.flatMap((r) => [r.root_node_id, ...r.links.flatMap((l) => [l.source_node_id, l.target_node_id])])));
  const { data: nodes } = await supabase.from('sanad_nodes').select('id, full_name_rumi, full_name_arabic').in('id', ids);
  const names = new Map((nodes ?? []).map((n) => [n.id as string, n]));
  return rows.map((r) => {
    const depth = orderUpwards(r.root_node_id, r.links);
    return {
      id: r.id,
      title: r.title,
      riwayat_id: r.riwayat_id,
      riwayat: r.riwayat?.full_label_rumi ?? null,
      tariq: r.tariq?.name_rumi ?? null,
      perawi: Array.from(depth.entries())
        .sort((a, b) => a[1] - b[1])
        .map(([id, d]) => ({ id, depth: d, name: (names.get(id)?.full_name_rumi as string) ?? '—', arabic: (names.get(id)?.full_name_arabic as string) || null })),
      links: r.links.map((l) => ({ source: l.source_node_id, target: l.target_node_id })),
    };
  });
}

/** Approved chains an administrator can copy from, with the perawi that have a teacher above them. */
export async function getCopyableChains(): Promise<Array<{ id: string; label: string; perawi: Array<{ id: string; name: string }> }>> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('sanad_chains')
    .select('id, sanad_code, title, teacher:teachers(public_display_name), edges:sanad_edges(source_node_id, target_node_id)')
    .in('verification_status', ['approved', 'published'])
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error || !data) return [];
  const rows = data as unknown as Array<{
    id: string;
    sanad_code: string;
    title: string;
    teacher: { public_display_name: string } | null;
    edges: Array<{ source_node_id: string; target_node_id: string }>;
  }>;
  const ids = Array.from(new Set(rows.flatMap((r) => r.edges.map((e) => e.target_node_id))));
  if (!ids.length) return [];
  const { data: nodes } = await supabase.from('sanad_nodes').select('id, full_name_rumi, linked_teacher_id').in('id', ids);
  const info = new Map((nodes ?? []).map((n) => [n.id as string, n]));
  return rows
    .map((r) => ({
      id: r.id,
      label: `${r.sanad_code} · ${r.title}${r.teacher ? ` (${r.teacher.public_display_name})` : ''}`,
      perawi: Array.from(new Set(r.edges.map((e) => e.target_node_id)))
        .filter((id) => info.get(id) && !info.get(id)!.linked_teacher_id)
        .map((id) => ({ id, name: info.get(id)!.full_name_rumi as string })),
    }))
    .filter((r) => r.perawi.length > 0);
}

export async function referenceChainsEnabled(): Promise<boolean> {
  const { data } = await createServerSupabase().rpc('reference_chains_enabled');
  return data === true;
}
