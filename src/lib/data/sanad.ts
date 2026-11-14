import 'server-only';
import { cache } from 'react';
import { createServerSupabase } from '@/lib/supabase/server';
import { createPublicSupabase } from '@/lib/supabase/public';
import { getSessionProfile } from '@/lib/auth/session';
import type { VerificationStatus } from '@/types/mysanad';
import type { GraphChainData, GraphEdgeData, GraphNodeData, SanadGraphData } from '@/lib/sanad/graph';

export class SanadDataError extends Error {
  constructor(context: string, cause: { message: string }) {
    super(`[${context}] ${cause.message}`);
    this.name = 'SanadDataError';
  }
}

export interface PublicGraphChain extends GraphChainData {
  qiraat_arabic?: string | null;
  riwayat_arabic?: string | null;
  transmission_method?: string;
  ijazah_date?: string | null;
  ijazah_location?: string | null;
  generation_depth?: number | null;
  public_notes?: string | null;
  verified_at?: string | null;
}

export interface PublicGraph extends SanadGraphData {
  chains: PublicGraphChain[];
}

/** Public graph: only approved, public nodes/edges of published teachers (enforced in SQL). */
export async function getPublicSanadGraph(filters: {
  chainId?: string;
  teacherId?: string;
  qiraatId?: string;
  riwayatId?: string;
}): Promise<PublicGraph | null> {
  const supabase = createPublicSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('get_public_sanad_graph', {
    p_chain_id: filters.chainId ?? null,
    p_teacher_id: filters.teacherId ?? null,
    p_qiraat_id: filters.qiraatId ?? null,
    p_riwayat_id: filters.riwayatId ?? null,
  });
  if (error) throw new SanadDataError('public-graph', error);
  return data as PublicGraph;
}

export interface MyChainSummary {
  id: string;
  sanad_code: string;
  title: string;
  verification_status: VerificationStatus;
  qiraat: string | null;
  riwayat: string | null;
  generation_depth: number | null;
  supersedes_chain_id: string | null;
  updated_at: string;
  edge_count: number;
}

async function myTeacher() {
  const profile = await getSessionProfile();
  if (!profile) return null;
  const supabase = createServerSupabase();
  const { data, error } = await supabase.from('teachers').select('id').eq('profile_id', profile.id).maybeSingle();
  if (error) throw new SanadDataError('teacher', error);
  return { supabase, teacherId: (data?.id as string | undefined) ?? null, userId: profile.id };
}

export const getMySanadChains = cache(async (): Promise<MyChainSummary[] | null> => {
  const ctx = await myTeacher();
  if (!ctx) return null;
  if (!ctx.teacherId) return [];
  const { data, error } = await ctx.supabase
    .from('sanad_chains')
    .select(
      'id, sanad_code, title, verification_status, generation_depth, supersedes_chain_id, updated_at, qiraat_types(title_rumi), riwayat_types(full_label_rumi), sanad_edges(count)',
    )
    .eq('teacher_id', ctx.teacherId)
    .order('updated_at', { ascending: false });
  if (error) throw new SanadDataError('my-chains', error);
  return (data ?? []).map((c) => {
    const row = c as unknown as Record<string, unknown> & {
      qiraat_types: { title_rumi: string } | null;
      riwayat_types: { full_label_rumi: string } | null;
      sanad_edges: Array<{ count: number }>;
    };
    return {
      id: row.id as string,
      sanad_code: row.sanad_code as string,
      title: row.title as string,
      verification_status: row.verification_status as VerificationStatus,
      generation_depth: row.generation_depth as number | null,
      supersedes_chain_id: row.supersedes_chain_id as string | null,
      updated_at: row.updated_at as string,
      qiraat: row.qiraat_types?.title_rumi ?? null,
      riwayat: row.riwayat_types?.full_label_rumi ?? null,
      edge_count: row.sanad_edges?.[0]?.count ?? 0,
    };
  });
});

export interface MyChainDetail {
  chain: {
    id: string;
    sanad_code: string;
    title: string;
    qiraat_id: string;
    riwayat_id: string;
    tariq_id: string | null;
    transmission_method: string;
    ijazah_date: string | null;
    ijazah_location: string | null;
    public_notes: string | null;
    allow_public_graph_export: boolean;
    verification_status: VerificationStatus;
    generation_depth: number | null;
    supersedes_chain_id: string | null;
  };
  graph: SanadGraphData;
  selfNodeId: string | null;
  revisions: Array<{ id: string; revision_no: number; reason: string; created_at: string }>;
  feedback: string | null;
}

/** The signed-in teacher's own chain with private details (RLS limits rows to the owner). */
export async function getMySanadChain(chainId: string): Promise<MyChainDetail | 'not-found' | null> {
  const ctx = await myTeacher();
  if (!ctx) return null;
  if (!ctx.teacherId) return 'not-found';
  const { supabase, teacherId, userId } = ctx;

  const { data: chain, error } = await supabase
    .from('sanad_chains')
    .select(
      'id, sanad_code, title, qiraat_id, riwayat_id, tariq_id, transmission_method, ijazah_date, ijazah_location, public_notes, allow_public_graph_export, verification_status, generation_depth, supersedes_chain_id',
    )
    .eq('id', chainId)
    .eq('teacher_id', teacherId)
    .maybeSingle();
  if (error) throw new SanadDataError('chain', error);
  if (!chain) return 'not-found';

  const [graph, revRes, feedbackRes] = await Promise.all([
    loadChainGraph(supabase, chainId, teacherId, userId),
    supabase
      .from('sanad_chain_revisions')
      .select('id, revision_no, reason, created_at')
      .eq('sanad_chain_id', chainId)
      .order('revision_no', { ascending: false }),
    supabase
      .from('verification_submissions')
      .select('decision_summary')
      .eq('target_type', 'sanad_chain')
      .eq('target_record_id', chainId)
      .not('decision_summary', 'is', null)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  for (const res of [revRes, feedbackRes]) {
    if (res.error) throw new SanadDataError('chain-detail', res.error);
  }

  return {
    chain: chain as MyChainDetail['chain'],
    graph: { chains: [{ id: chain.id, title: chain.title, verification_status: chain.verification_status }], nodes: graph.nodes, edges: graph.edges },
    selfNodeId: graph.selfNodeId,
    revisions: revRes.data ?? [],
    feedback: (feedbackRes.data?.decision_summary as string | undefined) ?? null,
  };
}

type SupabaseLike = ReturnType<typeof createServerSupabase>;

/**
 * Nodes and edges of one chain with private fields, read through the caller's session
 * (RLS: the owning teacher or an administrator). `userId` marks nodes the caller created.
 */
export async function loadChainGraph(
  supabase: SupabaseLike,
  chainId: string,
  teacherId: string,
  userId?: string,
): Promise<{ nodes: GraphNodeData[]; edges: GraphEdgeData[]; selfNodeId: string | null }> {
  const [edgesRes, selfRes] = await Promise.all([
    supabase
      .from('sanad_edges')
      .select(
        'id, source_node_id, target_node_id, sequence_order, transmission_relationship, riwayat_context, transmission_date_text, transmission_location, supporting_evidence, notes, verification_status',
      )
      .eq('sanad_chain_id', chainId)
      .order('sequence_order'),
    supabase.from('sanad_nodes').select('id').eq('linked_teacher_id', teacherId).maybeSingle(),
  ]);
  if (edgesRes.error) throw new SanadDataError('chain-edges', edgesRes.error);
  if (selfRes.error) throw new SanadDataError('chain-self', selfRes.error);

  const edgeRows = edgesRes.data ?? [];
  const selfId = (selfRes.data?.id as string | undefined) ?? null;
  const nodeIds = Array.from(new Set([...edgeRows.flatMap((e) => [e.source_node_id, e.target_node_id]), ...(selfId ? [selfId] : [])]));
  let nodes: GraphNodeData[] = [];
  if (nodeIds.length) {
    const { data: nodeRows, error } = await supabase
      .from('sanad_nodes')
      .select(
        'id, full_name_rumi, full_name_arabic, alternative_spellings, historical_title, generation_category, birth_year_hijri, death_year_hijri, birth_year_miladi, death_year_miladi, country_or_region, biography, scholarly_references, verification_status, linked_teacher_id, created_by',
      )
      .in('id', nodeIds);
    if (error) throw new SanadDataError('chain-nodes', error);
    nodes = (nodeRows ?? []).map(({ created_by, ...n }) => ({
      ...n,
      full_name_arabic: n.full_name_arabic || null,
      is_self: n.id === selfId,
      is_mine: userId ? created_by === userId : false,
    }));
  }
  const edges: GraphEdgeData[] = edgeRows.map((e) => ({
    id: e.id,
    chain_id: chainId,
    source: e.source_node_id,
    target: e.target_node_id,
    sequence_order: e.sequence_order,
    transmission_relationship: e.transmission_relationship,
    riwayat_context: e.riwayat_context,
    transmission_date_text: e.transmission_date_text,
    transmission_location: e.transmission_location,
    supporting_evidence: e.supporting_evidence,
    notes: e.notes,
    verification_status: e.verification_status,
  }));
  return { nodes, edges, selfNodeId: selfId };
}
