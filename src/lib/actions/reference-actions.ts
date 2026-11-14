'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth/session';
import { canAccessAdminPortal, isSuperAdmin } from '@/lib/auth/roles';
import { consumeRateLimit } from '@/lib/rate-limit';
import type { ActionResult } from '@/lib/validations/auth';
import { IdSchema } from '@/lib/validations/teacher';
import { DistrictSchema, QiraatSchema, ReferenceNodeSchema, RiwayatSchema, SettingsSchema, TariqSchema, slugify } from '@/lib/validations/reference';

async function guard(superOnly: boolean): Promise<ActionResult | null> {
  const p = await getSessionProfile();
  if (!p || !canAccessAdminPortal(p)) return { ok: false, message: 'Hanya pentadbir dibenarkan.' };
  if (superOnly && !isSuperAdmin(p)) return { ok: false, message: 'Hanya Super Admin dibenarkan.' };
  if (!(await consumeRateLimit('adminWrite', `user:${p.id}`))) return { ok: false, message: 'Terlalu banyak permintaan.' };
  return null;
}

function dbError(error: { code?: string; message: string }): ActionResult {
  if (/row-level security/i.test(error.message)) return { ok: false, message: 'Anda tidak mempunyai kebenaran.' };
  if (error.code === '23505') return { ok: false, message: 'Kod atau nama yang sama sudah wujud.' };
  if (error.code === '23514') return { ok: false, message: 'Format data tidak sah.' };
  if (['42501', '22023'].includes(error.code ?? '')) return { ok: false, message: error.message };
  console.error('[reference-actions]', error.code, error.message);
  return { ok: false, message: 'Ralat pangkalan data.' };
}

const invalid = (e: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }): ActionResult => ({
  ok: false,
  message: 'Sila semak medan yang bertanda.',
  fieldErrors: e.flatten().fieldErrors,
});

function refresh() {
  revalidatePath('/admin/reference-data');
  revalidatePath('/', 'layout');
}

/** Upsert by id: update when given, insert otherwise. */
async function upsert(table: string, id: string | undefined, row: Record<string, unknown>): Promise<ActionResult> {
  const s = createServerSupabase();
  const res = id ? await s.from(table).update(row).eq('id', id).select('id').maybeSingle() : await s.from(table).insert(row).select('id').single();
  if (res.error) return dbError(res.error);
  if (!res.data) return { ok: false, message: 'Rekod tidak ditemui atau anda tidak mempunyai kebenaran.' };
  refresh();
  return { ok: true, message: 'Disimpan.' };
}

export async function saveDistrictAction(raw: unknown): Promise<ActionResult> {
  const g = await guard(false);
  if (g) return g;
  const p = DistrictSchema.safeParse(raw);
  if (!p.success) return invalid(p.error);
  const slug = slugify(p.data.name);
  if (slug.length < 2) return { ok: false, fieldErrors: { name: ['Nama daerah tidak sah.'] } };
  return upsert('malaysian_districts', p.data.id, { state_id: p.data.state_id, name: p.data.name, slug });
}

export async function setDistrictActiveAction(id: string, active: boolean): Promise<ActionResult> {
  const g = await guard(false);
  if (g) return g;
  if (!IdSchema.safeParse(id).success) return { ok: false, message: 'Rekod tidak sah.' };
  return upsert('malaysian_districts', id, { is_active: Boolean(active) });
}

export async function saveQiraatAction(raw: unknown): Promise<ActionResult> {
  const g = await guard(true);
  if (g) return g;
  const p = QiraatSchema.safeParse(raw);
  if (!p.success) return invalid(p.error);
  const { id, ...row } = p.data;
  return upsert('qiraat_types', id, { ...row, era_hijri: row.era_hijri ?? null, region_origin: row.region_origin ?? null, description: row.description ?? null });
}

export async function saveRiwayatAction(raw: unknown): Promise<ActionResult> {
  const g = await guard(true);
  if (g) return g;
  const p = RiwayatSchema.safeParse(raw);
  if (!p.success) return invalid(p.error);
  const { id, ...row } = p.data;
  return upsert('riwayat_types', id, { ...row, era_hijri: row.era_hijri ?? null, description: row.description ?? null });
}

export async function saveTariqAction(raw: unknown): Promise<ActionResult> {
  const g = await guard(true);
  if (g) return g;
  const p = TariqSchema.safeParse(raw);
  if (!p.success) return invalid(p.error);
  const { id, ...row } = p.data;
  return upsert('tariq_types', id, {
    ...row,
    riwayat_id: row.riwayat_id ?? null,
    source_book_rumi: row.source_book_rumi ?? null,
    source_book_arabic: row.source_book_arabic ?? null,
    description: row.description ?? null,
  });
}

/** Administrator-curated transmitter: approved and public, shared by all teachers. */
export async function saveReferenceNodeAction(raw: unknown): Promise<ActionResult> {
  const g = await guard(false);
  if (g) return g;
  const p = ReferenceNodeSchema.safeParse(raw);
  if (!p.success) return invalid(p.error);
  const n = p.data.node;
  return upsert('sanad_nodes', p.data.id, {
    canonical_code: p.data.canonical_code,
    full_name_rumi: n.full_name_rumi,
    full_name_arabic: n.full_name_arabic ?? '',
    alternative_spellings: n.alternative_spellings,
    historical_title: n.historical_title ?? null,
    generation_category: n.generation_category,
    birth_year_hijri: n.birth_year_hijri ?? null,
    death_year_hijri: n.death_year_hijri ?? null,
    birth_year_miladi: n.birth_year_miladi ?? null,
    death_year_miladi: n.death_year_miladi ?? null,
    country_or_region: n.country_or_region ?? null,
    biography: n.biography ?? null,
    scholarly_references: n.scholarly_references,
    verification_status: 'approved',
    is_public: true,
  });
}

export async function saveSettingsAction(raw: unknown): Promise<ActionResult> {
  const g = await guard(true);
  if (g) return g;
  const p = SettingsSchema.safeParse(raw);
  if (!p.success) return invalid(p.error);
  const s = createServerSupabase();
  // Each key is its own row with typed validation in the database.
  for (const [key, value] of Object.entries(p.data)) {
    const { error } = await s.from('system_settings').update({ value }).eq('key', key);
    if (error) return dbError(error);
  }
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Tetapan disimpan dan berkuat kuasa serta-merta.' };
}
