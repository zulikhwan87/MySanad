'use server';

import { revalidatePath } from 'next/cache';
import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';
import type { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth/session';
import { isAdmin } from '@/lib/auth/roles';
import { consumeRateLimit } from '@/lib/rate-limit';
import type { ActionResult } from '@/lib/validations/auth';
import { IdSchema } from '@/lib/validations/teacher';
import { NewSanadChainSchema, NodeChoiceSchema, SanadChainSchema, SanadEdgeSchema, SanadNodeSchema } from '@/lib/validations/sanad';

type Result = ActionResult & { id?: string };

interface Ctx {
  supabase: SupabaseClient;
  userId: string;
  teacherId: string;
  /** An administrator working on another teacher's sanad. */
  admin: boolean;
}

/**
 * Teachers act on their own chains. Administrators act on any teacher's chain: pass the teacher
 * (new chain) or the chain; the owning teacher is resolved from it.
 */
async function context(target: { teacherId?: string; chainId?: string } = {}): Promise<Ctx | Result> {
  const profile = await getSessionProfile();
  if (!profile) return { ok: false, message: 'Sesi tamat. Sila log masuk semula.' };
  if (!profile.is_active) return { ok: false, message: 'Akaun anda tidak aktif.' };
  const admin = isAdmin(profile) && Boolean(target.teacherId || target.chainId);
  if (target.teacherId && !admin) return { ok: false, message: 'Anda tidak mempunyai kebenaran untuk tindakan ini.' };
  if (!(await consumeRateLimit(admin ? 'adminWrite' : 'teacherWrite', `user:${profile.id}`))) {
    return { ok: false, message: 'Terlalu banyak permintaan. Sila tunggu sebentar.' };
  }
  const supabase = createServerSupabase();
  if (admin) {
    if (target.teacherId) {
      if (!IdSchema.safeParse(target.teacherId).success) return { ok: false, message: 'Guru tidak ditemui.' };
      const { data } = await supabase.from('teachers').select('id').eq('id', target.teacherId).maybeSingle();
      if (!data) return { ok: false, message: 'Guru tidak ditemui.' };
      return { supabase, userId: profile.id, teacherId: data.id as string, admin };
    }
    if (!IdSchema.safeParse(target.chainId).success) return { ok: false, message: 'Rantaian tidak ditemui.' };
    const { data } = await supabase.from('sanad_chains').select('teacher_id').eq('id', target.chainId!).maybeSingle();
    if (!data) return { ok: false, message: 'Rantaian tidak ditemui.' };
    return { supabase, userId: profile.id, teacherId: data.teacher_id as string, admin };
  }
  const { data, error } = await supabase.from('teachers').select('id').eq('profile_id', profile.id).maybeSingle();
  if (error) return dbError(error);
  if (!data) return { ok: false, message: 'Lengkapkan profil guru anda dahulu.' };
  return { supabase, userId: profile.id, teacherId: data.id as string, admin: false };
}

const isCtx = (v: Ctx | Result): v is Ctx => 'supabase' in v;

function dbError(error: PostgrestError | { code?: string; message: string }): Result {
  const code = 'code' in error ? error.code : undefined;
  if (/row-level security/i.test(error.message)) return { ok: false, message: 'Anda tidak mempunyai kebenaran untuk tindakan ini.' };
  if (['42501', '22023', 'P0002'].includes(code ?? '')) return { ok: false, message: error.message };
  if (code === '23505') {
    return { ok: false, message: /Semakan baharu/.test(error.message) ? error.message : 'Hubungan atau rekod yang sama sudah wujud.' };
  }
  if (code === '23514') return { ok: false, message: 'Data tidak memenuhi syarat (contoh: perawi tidak boleh meriwayatkan daripada dirinya sendiri).' };
  if (code === '23503') return { ok: false, message: 'Rujukan yang dipilih tidak sah.' };
  console.error('[sanad-actions]', code, error.message);
  return { ok: false, message: 'Ralat pangkalan data. Sila cuba lagi.' };
}

function invalid(error: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }): Result {
  return { ok: false, message: 'Sila semak medan yang bertanda.', fieldErrors: error.flatten().fieldErrors };
}

function refresh(chainId?: string) {
  revalidatePath('/teacher/sanad');
  if (chainId) revalidatePath(`/teacher/sanad/${chainId}`);
  revalidatePath('/admin/teachers', 'layout');
}

async function riwayatMatches(supabase: SupabaseClient, qiraatId: string, riwayatId: string) {
  const { data } = await supabase.from('riwayat_types').select('id').eq('id', riwayatId).eq('qiraat_id', qiraatId).maybeSingle();
  return Boolean(data);
}

function nodeRow(node: z.infer<typeof SanadNodeSchema>) {
  return {
    full_name_rumi: node.full_name_rumi,
    full_name_arabic: node.full_name_arabic ?? '',
    alternative_spellings: node.alternative_spellings,
    historical_title: node.historical_title ?? null,
    generation_category: node.generation_category ?? null,
    birth_year_hijri: node.birth_year_hijri ?? null,
    death_year_hijri: node.death_year_hijri ?? null,
    birth_year_miladi: node.birth_year_miladi ?? null,
    death_year_miladi: node.death_year_miladi ?? null,
    country_or_region: node.country_or_region ?? null,
    biography: node.biography ?? null,
    scholarly_references: node.scholarly_references,
  };
}

function edgeRow(edge: z.infer<typeof SanadEdgeSchema>) {
  return {
    transmission_relationship: edge.transmission_relationship ?? null,
    riwayat_context: edge.riwayat_context ?? null,
    transmission_date_text: edge.transmission_date_text ?? null,
    transmission_location: edge.transmission_location ?? null,
    sequence_order: edge.sequence_order,
    supporting_evidence: edge.supporting_evidence ?? null,
    notes: edge.notes ?? null,
  };
}

/** Resolves an explicit choice: an existing node the teacher may use, or a brand-new node. */
async function resolveNode(c: Ctx, choice: z.infer<typeof NodeChoiceSchema>): Promise<{ id: string; created: boolean } | Result> {
  if (choice.mode === 'existing') return { id: choice.node_id, created: false };
  const { data, error } = await c.supabase.from('sanad_nodes').insert(nodeRow(choice.node)).select('id').single();
  if (error) return dbError(error);
  return { id: data.id as string, created: true };
}

async function ownsChain(c: Ctx, chainId: string) {
  const { data } = await c.supabase.from('sanad_chains').select('id').eq('id', chainId).eq('teacher_id', c.teacherId).maybeSingle();
  return Boolean(data);
}

// ---------------------------------------------------------------------------

/** Creates a draft chain with the teacher's direct shaykh linked to the teacher's own node. */
export async function createSanadChainAction(raw: unknown, teacherId?: string): Promise<Result> {
  const c = await context({ teacherId });
  if (!isCtx(c)) return c;
  const parsed = NewSanadChainSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const { chain, shaykh, edge } = parsed.data;
  if (!(await riwayatMatches(c.supabase, chain.qiraat_id, chain.riwayat_id))) {
    return { ok: false, fieldErrors: { riwayat_id: ['Riwayat tidak sepadan dengan qiraat.'] } };
  }

  const self = await c.supabase.rpc('ensure_my_sanad_node', c.admin ? { p_teacher_id: c.teacherId } : {});
  if (self.error) return dbError(self.error);

  const created = await c.supabase
    .from('sanad_chains')
    .insert({
      teacher_id: c.teacherId,
      title: chain.title,
      qiraat_id: chain.qiraat_id,
      riwayat_id: chain.riwayat_id,
      tariq_id: chain.tariq_id ?? null,
      transmission_method: chain.transmission_method ?? null,
      ijazah_date: chain.ijazah_date ?? null,
      ijazah_location: chain.ijazah_location ?? null,
      public_notes: chain.public_notes ?? null,
      allow_public_graph_export: chain.allow_public_graph_export,
    })
    .select('id')
    .single();
  if (created.error) return dbError(created.error);
  const chainId = created.data.id as string;

  // Multi-step over the API: remove the empty draft if linking the shaykh fails.
  const rollback = async (res: Result) => {
    await c.supabase.from('sanad_chains').delete().eq('id', chainId);
    return res;
  };
  const node = await resolveNode(c, shaykh);
  if ('ok' in node) return rollback(node);
  const link = await c.supabase
    .from('sanad_edges')
    .insert({ sanad_chain_id: chainId, source_node_id: node.id, target_node_id: self.data as string, ...edgeRow(edge) });
  if (link.error) {
    if (node.created) await c.supabase.from('sanad_nodes').delete().eq('id', node.id);
    return rollback(dbError(link.error));
  }

  refresh(chainId);
  return { ok: true, message: 'Rantaian sanad dicipta sebagai draf.', id: chainId };
}

export async function updateSanadChainAction(chainId: string, raw: unknown): Promise<Result> {
  const c = await context({ chainId });
  if (!isCtx(c)) return c;
  if (!IdSchema.safeParse(chainId).success) return { ok: false, message: 'Rekod tidak sah.' };
  const parsed = SanadChainSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  if (!(await riwayatMatches(c.supabase, v.qiraat_id, v.riwayat_id))) {
    return { ok: false, fieldErrors: { riwayat_id: ['Riwayat tidak sepadan dengan qiraat.'] } };
  }
  const { data, error } = await c.supabase
    .from('sanad_chains')
    .update({
      title: v.title,
      qiraat_id: v.qiraat_id,
      riwayat_id: v.riwayat_id,
      tariq_id: v.tariq_id ?? null,
      transmission_method: v.transmission_method ?? null,
      ijazah_date: v.ijazah_date ?? null,
      ijazah_location: v.ijazah_location ?? null,
      public_notes: v.public_notes ?? null,
      allow_public_graph_export: v.allow_public_graph_export,
    })
    .eq('id', chainId)
    .eq('teacher_id', c.teacherId)
    .select('id')
    .maybeSingle();
  if (error) return dbError(error);
  if (!data) return { ok: false, message: 'Rantaian tidak ditemui.' };
  refresh(chainId);
  return { ok: true, message: 'Maklumat rantaian disimpan.' };
}

export async function deleteSanadChainAction(chainId: string): Promise<Result> {
  const c = await context({ chainId });
  if (!isCtx(c)) return c;
  if (!IdSchema.safeParse(chainId).success) return { ok: false, message: 'Rekod tidak sah.' };
  const { error, count } = await c.supabase.from('sanad_chains').delete({ count: 'exact' }).eq('id', chainId).eq('teacher_id', c.teacherId);
  if (error) return dbError(error);
  if (!count) return { ok: false, message: 'Rantaian tidak ditemui.' };
  refresh();
  return { ok: true, message: 'Rantaian draf dipadam.' };
}

/** Adds a shaykh above `studentNodeId`; several shaykhs for one student form branches. */
export async function addShaykhAction(chainId: string, studentNodeId: string, choiceRaw: unknown, edgeRaw: unknown): Promise<Result> {
  const c = await context({ chainId });
  if (!isCtx(c)) return c;
  if (!IdSchema.safeParse(chainId).success || !IdSchema.safeParse(studentNodeId).success) return { ok: false, message: 'Rekod tidak sah.' };
  if (!(await ownsChain(c, chainId))) return { ok: false, message: 'Rantaian tidak ditemui.' };
  const choice = NodeChoiceSchema.safeParse(choiceRaw);
  if (!choice.success) return invalid(choice.error);
  const edge = SanadEdgeSchema.safeParse(edgeRaw);
  if (!edge.success) return invalid(edge.error);

  const node = await resolveNode(c, choice.data);
  if ('ok' in node) return node;
  const { error } = await c.supabase
    .from('sanad_edges')
    .insert({ sanad_chain_id: chainId, source_node_id: node.id, target_node_id: studentNodeId, ...edgeRow(edge.data) });
  if (error) {
    if (node.created) await c.supabase.from('sanad_nodes').delete().eq('id', node.id);
    return dbError(error);
  }
  refresh(chainId);
  return { ok: true, message: 'Perawi ditambah.', id: node.id };
}

/** Links two nodes the teacher can already see (shared nodes / alternative routes). */
export async function linkNodesAction(chainId: string, sourceId: string, targetId: string, edgeRaw: unknown): Promise<Result> {
  const c = await context({ chainId });
  if (!isCtx(c)) return c;
  if (![chainId, sourceId, targetId].every((id) => IdSchema.safeParse(id).success)) return { ok: false, message: 'Rekod tidak sah.' };
  if (sourceId === targetId) return { ok: false, message: 'Perawi tidak boleh meriwayatkan daripada dirinya sendiri.' };
  if (!(await ownsChain(c, chainId))) return { ok: false, message: 'Rantaian tidak ditemui.' };
  const edge = SanadEdgeSchema.safeParse(edgeRaw);
  if (!edge.success) return invalid(edge.error);
  const { error } = await c.supabase
    .from('sanad_edges')
    .insert({ sanad_chain_id: chainId, source_node_id: sourceId, target_node_id: targetId, ...edgeRow(edge.data) });
  if (error) return dbError(error);
  refresh(chainId);
  return { ok: true, message: 'Hubungan ditambah.' };
}

export async function updateEdgeAction(chainId: string, edgeId: string, raw: unknown): Promise<Result> {
  const c = await context({ chainId });
  if (!isCtx(c)) return c;
  if (!IdSchema.safeParse(chainId).success || !IdSchema.safeParse(edgeId).success) return { ok: false, message: 'Rekod tidak sah.' };
  if (!(await ownsChain(c, chainId))) return { ok: false, message: 'Rantaian tidak ditemui.' };
  const parsed = SanadEdgeSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const { data, error } = await c.supabase
    .from('sanad_edges')
    .update(edgeRow(parsed.data))
    .eq('id', edgeId)
    .eq('sanad_chain_id', chainId)
    .select('id')
    .maybeSingle();
  if (error) return dbError(error);
  if (!data) return { ok: false, message: 'Hubungan tidak ditemui.' };
  refresh(chainId);
  return { ok: true, message: 'Hubungan dikemas kini.' };
}

export async function deleteEdgeAction(chainId: string, edgeId: string): Promise<Result> {
  const c = await context({ chainId });
  if (!isCtx(c)) return c;
  if (!IdSchema.safeParse(chainId).success || !IdSchema.safeParse(edgeId).success) return { ok: false, message: 'Rekod tidak sah.' };
  if (!(await ownsChain(c, chainId))) return { ok: false, message: 'Rantaian tidak ditemui.' };
  const { error, count } = await c.supabase.from('sanad_edges').delete({ count: 'exact' }).eq('id', edgeId).eq('sanad_chain_id', chainId);
  if (error) return dbError(error);
  if (!count) return { ok: false, message: 'Hubungan tidak ditemui.' };
  refresh(chainId);
  return { ok: true, message: 'Hubungan dipadam.' };
}

async function editableChain(c: Ctx, chainId: string) {
  const { data } = await c.supabase
    .from('sanad_chains')
    .select('id, verification_status')
    .eq('id', chainId)
    .eq('teacher_id', c.teacherId)
    .maybeSingle();
  if (!data) return 'missing' as const;
  return ['draft', 'revision_required'].includes(data.verification_status as string) ? ('ok' as const) : ('locked' as const);
}

const LOCKED: Result = {
  ok: false,
  message: 'Rantaian ini dikunci. Klik "Betulkan sanad" (atau tarik balik jika belum disemak) untuk membuat pembetulan.',
};

/** Points every edge of this chain that uses `oldId` to `newId` instead. Other chains are untouched. */
async function swapNodeInChain(c: Ctx, chainId: string, oldId: string, newId: string) {
  const a = await c.supabase.from('sanad_edges').update({ source_node_id: newId }).eq('sanad_chain_id', chainId).eq('source_node_id', oldId);
  if (a.error) return a.error;
  const b = await c.supabase.from('sanad_edges').update({ target_node_id: newId }).eq('sanad_chain_id', chainId).eq('target_node_id', oldId);
  if (b.error) {
    await c.supabase.from('sanad_edges').update({ source_node_id: oldId }).eq('sanad_chain_id', chainId).eq('source_node_id', newId);
    return b.error;
  }
  return null;
}

async function loadChainNode(c: Ctx, chainId: string, nodeId: string) {
  const { data: node } = await c.supabase
    .from('sanad_nodes')
    .select('id, created_by, verification_status, linked_teacher_id')
    .eq('id', nodeId)
    .maybeSingle();
  if (!node) return null;
  const { count } = await c.supabase
    .from('sanad_edges')
    .select('id', { count: 'exact', head: true })
    .eq('sanad_chain_id', chainId)
    .or(`source_node_id.eq.${nodeId},target_node_id.eq.${nodeId}`);
  return count ? node : null;
}

/**
 * Corrects a transmitter's details in this chain.
 * - A draft record the caller entered (not used by any other chain) is edited in place.
 * - A record that is already verified, or shared with other chains, is never changed for everyone:
 *   a corrected copy is created and used in THIS chain only. It is reviewed again by an
 *   administrator with the chain; the approved version stays public until then.
 */
export async function updateNodeAction(chainId: string, nodeId: string, raw: unknown): Promise<Result> {
  const c = await context({ chainId });
  if (!isCtx(c)) return c;
  if (!IdSchema.safeParse(chainId).success || !IdSchema.safeParse(nodeId).success) return { ok: false, message: 'Rekod tidak sah.' };
  const chain = await editableChain(c, chainId);
  if (chain === 'missing') return { ok: false, message: 'Rantaian tidak ditemui.' };
  if (chain === 'locked') return LOCKED;
  const parsed = SanadNodeSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const node = await loadChainNode(c, chainId, nodeId);
  if (!node) return { ok: false, message: 'Perawi tidak ditemui dalam rantaian ini.' };
  if (node.linked_teacher_id) return { ok: false, message: 'Nama guru sendiri dikemas kini melalui profil guru.' };

  const ownDraft = ['draft', 'revision_required'].includes(node.verification_status as string) && (node.created_by === c.userId || c.admin);
  let usedElsewhere = false;
  if (ownDraft) {
    const { count } = await c.supabase
      .from('sanad_edges')
      .select('id', { count: 'exact', head: true })
      .neq('sanad_chain_id', chainId)
      .or(`source_node_id.eq.${nodeId},target_node_id.eq.${nodeId}`);
    usedElsewhere = Boolean(count);
  }

  if (ownDraft && !usedElsewhere) {
    const { data, error } = await c.supabase.from('sanad_nodes').update(nodeRow(parsed.data)).eq('id', nodeId).select('id').maybeSingle();
    if (error) return dbError(error);
    if (!data) return { ok: false, message: 'Perawi tidak dapat dikemas kini.' };
    refresh(chainId);
    return { ok: true, message: 'Maklumat perawi dibetulkan.' };
  }

  const { data: copy, error } = await c.supabase.from('sanad_nodes').insert(nodeRow(parsed.data)).select('id').single();
  if (error) return dbError(error);
  const swapError = await swapNodeInChain(c, chainId, nodeId, copy.id as string);
  if (swapError) {
    await c.supabase.from('sanad_nodes').delete().eq('id', copy.id);
    return dbError(swapError);
  }
  refresh(chainId);
  return {
    ok: true,
    message: 'Pembetulan disimpan untuk rantaian ini dan akan disemak semula oleh pentadbir apabila rantaian dihantar.',
    id: copy.id as string,
  };
}

/** Replaces a wrongly chosen transmitter with another (an existing record or a new one), in this chain only. */
export async function replaceNodeAction(chainId: string, nodeId: string, choiceRaw: unknown): Promise<Result> {
  const c = await context({ chainId });
  if (!isCtx(c)) return c;
  if (!IdSchema.safeParse(chainId).success || !IdSchema.safeParse(nodeId).success) return { ok: false, message: 'Rekod tidak sah.' };
  const chain = await editableChain(c, chainId);
  if (chain === 'missing') return { ok: false, message: 'Rantaian tidak ditemui.' };
  if (chain === 'locked') return LOCKED;
  const choice = NodeChoiceSchema.safeParse(choiceRaw);
  if (!choice.success) return invalid(choice.error);
  const node = await loadChainNode(c, chainId, nodeId);
  if (!node) return { ok: false, message: 'Perawi tidak ditemui dalam rantaian ini.' };
  if (node.linked_teacher_id) return { ok: false, message: 'Guru sendiri tidak boleh diganti.' };
  if (choice.data.mode === 'existing' && choice.data.node_id === nodeId) return { ok: false, message: 'Pilih perawi yang berbeza.' };

  const next = await resolveNode(c, choice.data);
  if ('ok' in next) return next;
  const swapError = await swapNodeInChain(c, chainId, nodeId, next.id);
  if (swapError) {
    if (next.created) await c.supabase.from('sanad_nodes').delete().eq('id', next.id);
    return dbError(swapError);
  }
  refresh(chainId);
  return { ok: true, message: 'Perawi diganti dalam rantaian ini.', id: next.id };
}

/** Removes a transmitter from this chain (all of its links in this chain). */
export async function removeNodeFromChainAction(chainId: string, nodeId: string): Promise<Result> {
  const c = await context({ chainId });
  if (!isCtx(c)) return c;
  if (!IdSchema.safeParse(chainId).success || !IdSchema.safeParse(nodeId).success) return { ok: false, message: 'Rekod tidak sah.' };
  const chain = await editableChain(c, chainId);
  if (chain === 'missing') return { ok: false, message: 'Rantaian tidak ditemui.' };
  if (chain === 'locked') return LOCKED;
  const node = await loadChainNode(c, chainId, nodeId);
  if (!node) return { ok: false, message: 'Perawi tidak ditemui dalam rantaian ini.' };
  if (node.linked_teacher_id) return { ok: false, message: 'Guru sendiri tidak boleh dibuang daripada rantaian.' };
  const { error } = await c.supabase
    .from('sanad_edges')
    .delete()
    .eq('sanad_chain_id', chainId)
    .or(`source_node_id.eq.${nodeId},target_node_id.eq.${nodeId}`);
  if (error) return dbError(error);
  refresh(chainId);
  return { ok: true, message: 'Perawi dibuang daripada rantaian. Pastikan semua perawi lain masih bersambung sebelum menghantar.' };
}

export interface LinkableNode {
  id: string;
  full_name_rumi: string;
  full_name_arabic: string | null;
  historical_title: string | null;
  generation_category: string | null;
  death_year_hijri: string | null;
  country_or_region: string | null;
  verification_status: string;
  is_mine: boolean;
}

/** Candidates for an explicit link choice. Nothing is ever merged automatically. */
export async function searchLinkableNodesAction(query: string): Promise<LinkableNode[]> {
  if (typeof query !== 'string' || query.trim().length < 2) return [];
  const profile = await getSessionProfile();
  if (!profile) return [];
  const { data, error } = await createServerSupabase().rpc('search_linkable_sanad_nodes', { p_query: query.slice(0, 100), p_limit: 10 });
  if (error) {
    console.error('[sanad-actions] search', error.message);
    return [];
  }
  return ((data ?? []) as LinkableNode[]).map((n) => ({ ...n, full_name_arabic: n.full_name_arabic || null }));
}

export async function submitSanadChainAction(chainId: string, notes: string): Promise<Result> {
  const c = await context({ chainId });
  if (!isCtx(c)) return c;
  if (!IdSchema.safeParse(chainId).success) return { ok: false, message: 'Rekod tidak sah.' };
  const { error } = await c.supabase.rpc('submit_my_sanad_chain', {
    p_chain_id: chainId,
    p_notes: typeof notes === 'string' ? notes.slice(0, 1000) : null,
  });
  if (error) return dbError(error);
  refresh(chainId);
  revalidatePath('/teacher/verification');
  return { ok: true, message: 'Rantaian sanad dihantar untuk semakan.' };
}

export async function withdrawSanadChainAction(chainId: string): Promise<Result> {
  const c = await context({ chainId });
  if (!isCtx(c)) return c;
  if (!IdSchema.safeParse(chainId).success) return { ok: false, message: 'Rekod tidak sah.' };
  const { error } = await c.supabase.rpc('withdraw_my_sanad_chain', { p_chain_id: chainId });
  if (error) return dbError(error);
  refresh(chainId);
  return { ok: true, message: 'Rantaian ditarik balik dan boleh disunting semula.' };
}

export async function reviseSanadChainAction(chainId: string): Promise<Result> {
  const c = await context({ chainId });
  if (!isCtx(c)) return c;
  if (!IdSchema.safeParse(chainId).success) return { ok: false, message: 'Rekod tidak sah.' };
  const { data, error } = await c.supabase.rpc('revise_my_sanad_chain', { p_chain_id: chainId });
  if (error) return dbError(error);
  refresh();
  return {
    ok: true,
    message: 'Draf semakan baharu dicipta. Versi yang diluluskan kekal dipaparkan sehingga semakan ini diluluskan.',
    id: data as string,
  };
}
