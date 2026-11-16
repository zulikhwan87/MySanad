'use server';

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { z } from 'zod';
import { createServerSupabase } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth/session';
import { canAccessAdminPortal } from '@/lib/auth/roles';
import { consumeRateLimit } from '@/lib/rate-limit';
import type { ActionResult } from '@/lib/validations/auth';
import { IdSchema } from '@/lib/validations/teacher';
import { NodeChoiceSchema, SanadNodeSchema } from '@/lib/validations/sanad';
import { NewReferenceChainSchema, ReferenceChainMetaSchema, ReferenceFromChainSchema } from '@/lib/validations/reference';

type Result = ActionResult & { id?: string };

async function admin(): Promise<SupabaseClient | Result> {
  const p = await getSessionProfile();
  if (!p || !p.is_active || !canAccessAdminPortal(p)) return { ok: false, message: 'Hanya pentadbir dibenarkan.' };
  if (!(await consumeRateLimit('adminWrite', `user:${p.id}`))) return { ok: false, message: 'Terlalu banyak permintaan. Sila tunggu sebentar.' };
  return createServerSupabase();
}
const isClient = (v: SupabaseClient | Result): v is SupabaseClient => !('ok' in v);

function dbError(error: { code?: string; message: string }): Result {
  if (/row-level security/i.test(error.message)) return { ok: false, message: 'Anda tidak mempunyai kebenaran untuk tindakan ini.' };
  if (['42501', '22023', 'P0002'].includes(error.code ?? '')) return { ok: false, message: error.message };
  if (error.code === '23505') return { ok: false, message: 'Hubungan yang sama sudah wujud.' };
  if (error.code === '23514') return { ok: false, message: 'Data tidak memenuhi syarat (contoh: perawi tidak boleh meriwayatkan daripada dirinya sendiri).' };
  if (error.code === '23503') return { ok: false, message: 'Rekod ini masih digunakan atau rujukan tidak sah.' };
  console.error('[reference-chain-actions]', error.code, error.message);
  return { ok: false, message: 'Ralat pangkalan data. Sila cuba lagi.' };
}

const invalid = (e: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }): Result => ({
  ok: false,
  message: 'Sila semak medan yang bertanda.',
  fieldErrors: e.flatten().fieldErrors,
});

function refresh(id?: string) {
  revalidatePath('/admin/reference-chains');
  if (id) revalidatePath(`/admin/reference-chains/${id}`);
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

async function resolveNode(s: SupabaseClient, choice: z.infer<typeof NodeChoiceSchema>): Promise<{ id: string; created: boolean } | Result> {
  if (choice.mode === 'existing') return { id: choice.node_id, created: false };
  const { data, error } = await s.from('sanad_nodes').insert(nodeRow(choice.node)).select('id').single();
  if (error) return dbError(error);
  return { id: data.id as string, created: true };
}

async function loadChain(s: SupabaseClient, id: string) {
  if (!IdSchema.safeParse(id).success) return null;
  const { data } = await s.from('reference_chains').select('id, status, root_node_id').eq('id', id).maybeSingle();
  return data as { id: string; status: string; root_node_id: string } | null;
}

const LOCKED: Result = { ok: false, message: 'Nyahaktifkan rantaian rujukan ini dahulu untuk menyuntingnya.' };

// ---------------------------------------------------------------------------

export async function createReferenceChainAction(raw: unknown): Promise<Result> {
  const s = await admin();
  if (!isClient(s)) return s;
  const p = NewReferenceChainSchema.safeParse(raw);
  if (!p.success) return invalid(p.error);
  const root = await resolveNode(s, p.data.root);
  if ('ok' in root) return root;
  const m = p.data.meta;
  const { data, error } = await s
    .from('reference_chains')
    .insert({ title: m.title, qiraat_id: m.qiraat_id ?? null, riwayat_id: m.riwayat_id ?? null, tariq_id: m.tariq_id ?? null, notes: m.notes ?? null, root_node_id: root.id })
    .select('id')
    .single();
  if (error) {
    if (root.created) await s.from('sanad_nodes').delete().eq('id', root.id);
    return dbError(error);
  }
  refresh();
  return { ok: true, message: 'Draf rantaian rujukan dicipta.', id: data.id as string };
}

export async function createReferenceFromChainAction(raw: unknown): Promise<Result> {
  const s = await admin();
  if (!isClient(s)) return s;
  const p = ReferenceFromChainSchema.safeParse(raw);
  if (!p.success) return invalid(p.error);
  const { data, error } = await s.rpc('admin_create_reference_from_chain', {
    p_title: p.data.title,
    p_chain_id: p.data.chain_id,
    p_root_node_id: p.data.root_node_id,
  });
  if (error) return dbError(error);
  refresh();
  return { ok: true, message: 'Draf disalin. Semak setiap perawi sebelum mengaktifkannya.', id: data as string };
}

export async function updateReferenceMetaAction(id: string, raw: unknown): Promise<Result> {
  const s = await admin();
  if (!isClient(s)) return s;
  if (!(await loadChain(s, id))) return { ok: false, message: 'Rantaian rujukan tidak ditemui.' };
  const p = ReferenceChainMetaSchema.safeParse(raw);
  if (!p.success) return invalid(p.error);
  const m = p.data;
  const { error } = await s
    .from('reference_chains')
    .update({ title: m.title, qiraat_id: m.qiraat_id ?? null, riwayat_id: m.riwayat_id ?? null, tariq_id: m.tariq_id ?? null, notes: m.notes ?? null })
    .eq('id', id);
  if (error) return dbError(error);
  refresh(id);
  return { ok: true, message: 'Maklumat rantaian rujukan disimpan.' };
}

export async function setReferenceStatusAction(id: string, status: 'active' | 'inactive'): Promise<Result> {
  const s = await admin();
  if (!isClient(s)) return s;
  if (!IdSchema.safeParse(id).success || !['active', 'inactive'].includes(status)) return { ok: false, message: 'Permintaan tidak sah.' };
  const { error } = await s.rpc('admin_set_reference_chain_status', { p_id: id, p_status: status });
  if (error) return dbError(error);
  refresh(id);
  return {
    ok: true,
    message: status === 'active' ? 'Rantaian rujukan diaktifkan dan kini boleh digunakan oleh guru.' : 'Rantaian rujukan dinyahaktifkan. Guru tidak lagi melihatnya.',
  };
}

export async function deleteReferenceChainAction(id: string): Promise<Result> {
  const s = await admin();
  if (!isClient(s)) return s;
  const chain = await loadChain(s, id);
  if (!chain) return { ok: false, message: 'Rantaian rujukan tidak ditemui.' };
  if (chain.status === 'active') return { ok: false, message: 'Nyahaktifkan rantaian rujukan dahulu sebelum memadamnya.' };
  const { error } = await s.from('reference_chains').delete().eq('id', id);
  if (error) return dbError(error);
  refresh();
  return { ok: true, message: 'Rantaian rujukan dipadam. Rantaian guru yang pernah menyalinnya tidak terjejas.' };
}

/** Adds a teacher (shaykh) above `studentNodeId`. */
export async function addReferenceShaykhAction(id: string, studentNodeId: string, choiceRaw: unknown): Promise<Result> {
  const s = await admin();
  if (!isClient(s)) return s;
  const chain = await loadChain(s, id);
  if (!chain) return { ok: false, message: 'Rantaian rujukan tidak ditemui.' };
  if (chain.status === 'active') return LOCKED;
  if (!IdSchema.safeParse(studentNodeId).success) return { ok: false, message: 'Rekod tidak sah.' };
  const choice = NodeChoiceSchema.safeParse(choiceRaw);
  if (!choice.success) return invalid(choice.error);
  const node = await resolveNode(s, choice.data);
  if ('ok' in node) return node;
  const { error } = await s.from('reference_chain_links').insert({ reference_chain_id: id, source_node_id: node.id, target_node_id: studentNodeId });
  if (error) {
    if (node.created) await s.from('sanad_nodes').delete().eq('id', node.id);
    return dbError(error);
  }
  refresh(id);
  return { ok: true, message: 'Perawi ditambah.' };
}

export async function removeReferenceLinkAction(id: string, linkId: string): Promise<Result> {
  const s = await admin();
  if (!isClient(s)) return s;
  const chain = await loadChain(s, id);
  if (!chain) return { ok: false, message: 'Rantaian rujukan tidak ditemui.' };
  if (chain.status === 'active') return LOCKED;
  const { error } = await s.from('reference_chain_links').delete().eq('id', linkId).eq('reference_chain_id', id);
  if (error) return dbError(error);
  refresh(id);
  return { ok: true, message: 'Hubungan dipadam.' };
}

/** Uses `newId` instead of `oldId` in this reference only (links and starting perawi). */
async function swapInReference(s: SupabaseClient, chain: { id: string; root_node_id: string }, oldId: string, newId: string) {
  const a = await s.from('reference_chain_links').update({ source_node_id: newId }).eq('reference_chain_id', chain.id).eq('source_node_id', oldId);
  if (a.error) return a.error;
  const b = await s.from('reference_chain_links').update({ target_node_id: newId }).eq('reference_chain_id', chain.id).eq('target_node_id', oldId);
  if (b.error) return b.error;
  if (chain.root_node_id === oldId) {
    const c = await s.from('reference_chains').update({ root_node_id: newId }).eq('id', chain.id);
    if (c.error) return c.error;
  }
  return null;
}

async function usedOutside(s: SupabaseClient, chainId: string, nodeId: string) {
  const [edges, links, roots] = await Promise.all([
    s.from('sanad_edges').select('id', { count: 'exact', head: true }).or(`source_node_id.eq.${nodeId},target_node_id.eq.${nodeId}`),
    s.from('reference_chain_links').select('id', { count: 'exact', head: true }).neq('reference_chain_id', chainId).or(`source_node_id.eq.${nodeId},target_node_id.eq.${nodeId}`),
    s.from('reference_chains').select('id', { count: 'exact', head: true }).neq('id', chainId).eq('root_node_id', nodeId),
  ]);
  return Boolean(edges.count || links.count || roots.count);
}

/**
 * Corrects a perawi. When the record is also used elsewhere (teachers' chains or other references),
 * a corrected copy is used in this reference only, so nothing else changes.
 */
export async function correctReferenceNodeAction(id: string, nodeId: string, raw: unknown): Promise<Result> {
  const s = await admin();
  if (!isClient(s)) return s;
  const chain = await loadChain(s, id);
  if (!chain) return { ok: false, message: 'Rantaian rujukan tidak ditemui.' };
  if (chain.status === 'active') return LOCKED;
  if (!IdSchema.safeParse(nodeId).success) return { ok: false, message: 'Rekod tidak sah.' };
  const p = SanadNodeSchema.safeParse(raw);
  if (!p.success) return invalid(p.error);

  if (!(await usedOutside(s, id, nodeId))) {
    const { error } = await s.from('sanad_nodes').update(nodeRow(p.data)).eq('id', nodeId).is('linked_teacher_id', null);
    if (error) return dbError(error);
    refresh(id);
    return { ok: true, message: 'Maklumat perawi dibetulkan.' };
  }
  const { data: copy, error } = await s.from('sanad_nodes').insert(nodeRow(p.data)).select('id').single();
  if (error) return dbError(error);
  const swapError = await swapInReference(s, chain, nodeId, copy.id as string);
  if (swapError) {
    await s.from('sanad_nodes').delete().eq('id', copy.id);
    return dbError(swapError);
  }
  refresh(id);
  return { ok: true, message: 'Perawi ini juga digunakan di tempat lain; pembetulan digunakan dalam rantaian rujukan ini sahaja.' };
}

export async function replaceReferenceNodeAction(id: string, nodeId: string, choiceRaw: unknown): Promise<Result> {
  const s = await admin();
  if (!isClient(s)) return s;
  const chain = await loadChain(s, id);
  if (!chain) return { ok: false, message: 'Rantaian rujukan tidak ditemui.' };
  if (chain.status === 'active') return LOCKED;
  if (!IdSchema.safeParse(nodeId).success) return { ok: false, message: 'Rekod tidak sah.' };
  const choice = NodeChoiceSchema.safeParse(choiceRaw);
  if (!choice.success) return invalid(choice.error);
  if (choice.data.mode === 'existing' && choice.data.node_id === nodeId) return { ok: false, message: 'Pilih perawi yang berbeza.' };
  const next = await resolveNode(s, choice.data);
  if ('ok' in next) return next;
  const swapError = await swapInReference(s, chain, nodeId, next.id);
  if (swapError) {
    if (next.created) await s.from('sanad_nodes').delete().eq('id', next.id);
    return dbError(swapError);
  }
  refresh(id);
  return { ok: true, message: 'Perawi diganti dalam rantaian rujukan ini.' };
}

export async function removeReferenceNodeAction(id: string, nodeId: string): Promise<Result> {
  const s = await admin();
  if (!isClient(s)) return s;
  const chain = await loadChain(s, id);
  if (!chain) return { ok: false, message: 'Rantaian rujukan tidak ditemui.' };
  if (chain.status === 'active') return LOCKED;
  if (chain.root_node_id === nodeId) return { ok: false, message: 'Perawi permulaan tidak boleh dibuang; gunakan "Ganti" untuk menukarnya.' };
  const { error } = await s
    .from('reference_chain_links')
    .delete()
    .eq('reference_chain_id', id)
    .or(`source_node_id.eq.${nodeId},target_node_id.eq.${nodeId}`);
  if (error) return dbError(error);
  refresh(id);
  return { ok: true, message: 'Perawi dibuang daripada rantaian rujukan.' };
}
