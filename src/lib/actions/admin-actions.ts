'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { getSessionProfile, type SessionProfile } from '@/lib/auth/session';
import { canAccessAdminPortal, canAssignRoles, isSuperAdmin } from '@/lib/auth/roles';
import { consumeRateLimit } from '@/lib/rate-limit';
import { decryptPii } from '@/lib/crypto/pii';
import type { ActionResult } from '@/lib/validations/auth';
import { IdSchema } from '@/lib/validations/teacher';
import {
  ChangeRequestDecisionSchema,
  DecisionSchema,
  InstitutionUpdateSchema,
  ItemStatusSchema,
  PublicationSchema,
  RevealIcSchema,
  UserActiveSchema,
  UserRoleSchema,
} from '@/lib/validations/admin';

type Result = ActionResult & { value?: string };

async function adminContext(requireSuper = false): Promise<{ profile: SessionProfile } | Result> {
  const profile = await getSessionProfile();
  if (!profile || !canAccessAdminPortal(profile)) return { ok: false, message: 'Hanya pentadbir dibenarkan.' };
  if (requireSuper && !isSuperAdmin(profile)) return { ok: false, message: 'Hanya Super Admin dibenarkan.' };
  if (!(await consumeRateLimit('adminWrite', `user:${profile.id}`))) return { ok: false, message: 'Terlalu banyak permintaan.' };
  return { profile };
}
const isCtx = (v: { profile: SessionProfile } | Result): v is { profile: SessionProfile } => 'profile' in v;

function dbError(error: { code?: string; message: string }): Result {
  if (/row-level security/i.test(error.message)) return { ok: false, message: 'Anda tidak mempunyai kebenaran untuk tindakan ini.' };
  if (['42501', '22023', 'P0002', '23505'].includes(error.code ?? '')) return { ok: false, message: error.message };
  console.error('[admin-actions]', error.code, error.message);
  return { ok: false, message: 'Ralat pangkalan data. Sila cuba lagi.' };
}

function invalid(error: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } }): Result {
  return { ok: false, message: 'Sila semak medan yang bertanda.', fieldErrors: error.flatten().fieldErrors };
}

function refreshAll() {
  revalidatePath('/admin', 'layout');
  revalidatePath('/teacher', 'layout');
  revalidatePath('/', 'layout');
}

export async function startReviewAction(submissionId: string): Promise<Result> {
  const c = await adminContext();
  if (!isCtx(c)) return c;
  if (!IdSchema.safeParse(submissionId).success) return { ok: false, message: 'Rekod tidak sah.' };
  const { error } = await createServerSupabase().rpc('admin_start_review', { p_submission_id: submissionId });
  if (error) return dbError(error);
  refreshAll();
  return { ok: true, message: 'Semakan dimulakan. Guru tidak boleh menyunting rekod ini semasa semakan.' };
}

export async function decideSubmissionAction(raw: unknown): Promise<Result> {
  const c = await adminContext();
  if (!isCtx(c)) return c;
  const parsed = DecisionSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  const { error } = await createServerSupabase().rpc('admin_decide_submission', {
    p_submission_id: v.submission_id,
    p_decision: v.decision,
    p_public_feedback: v.public_feedback ?? null,
    p_internal_comment: v.internal_comment ?? null,
    p_checklist: v.checklist,
  });
  if (error) return dbError(error);
  refreshAll();
  return { ok: true, message: 'Keputusan direkodkan dan guru telah dimaklumkan.' };
}

export async function decideChangeRequestAction(raw: unknown): Promise<Result> {
  const c = await adminContext();
  if (!isCtx(c)) return c;
  const parsed = ChangeRequestDecisionSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  const { error } = await createServerSupabase().rpc('admin_decide_change_request', {
    p_request_id: v.request_id,
    p_approve: v.approve,
    p_feedback: v.feedback ?? null,
  });
  if (error) return dbError(error);
  refreshAll();
  return { ok: true, message: v.approve ? 'Perubahan diluluskan dan kini dipaparkan.' : 'Permohonan perubahan ditolak.' };
}

export async function setPublicationAction(raw: unknown): Promise<Result> {
  const c = await adminContext();
  if (!isCtx(c)) return c;
  const parsed = PublicationSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const v = parsed.data;
  const { error } = await createServerSupabase().rpc('admin_set_publication', {
    p_teacher_id: v.teacher_id,
    p_action: v.action,
    p_reason: v.reason ?? null,
  });
  if (error) return dbError(error);
  refreshAll();
  return { ok: true, message: 'Status penerbitan dikemas kini.' };
}

export async function setFeaturedAction(teacherId: string, featured: boolean): Promise<Result> {
  const c = await adminContext();
  if (!isCtx(c)) return c;
  if (!IdSchema.safeParse(teacherId).success) return { ok: false, message: 'Rekod tidak sah.' };
  const { error } = await createServerSupabase().rpc('admin_set_featured', { p_teacher_id: teacherId, p_featured: Boolean(featured) });
  if (error) return dbError(error);
  refreshAll();
  return { ok: true, message: featured ? 'Guru ditandakan sebagai pilihan.' : 'Tanda pilihan dibuang.' };
}

export async function setItemStatusAction(raw: unknown): Promise<Result> {
  const c = await adminContext();
  if (!isCtx(c)) return c;
  const parsed = ItemStatusSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const { error } = await createServerSupabase().rpc('admin_set_item_status', {
    p_table: parsed.data.table,
    p_id: parsed.data.id,
    p_status: parsed.data.status,
  });
  if (error) return dbError(error);
  refreshAll();
  return { ok: true, message: 'Status item dikemas kini.' };
}

/** Full MyKad for identity verification: reason required, audited in the database, heavily rate limited. */
export async function revealIcAction(raw: unknown): Promise<Result> {
  const c = await adminContext();
  if (!isCtx(c)) return c;
  if (!(await consumeRateLimit('revealIc', `user:${c.profile.id}`))) return { ok: false, message: 'Had paparan MyKad dicapai. Cuba lagi kemudian.' };
  const parsed = RevealIcSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const { data, error } = await createServerSupabase().rpc('admin_get_teacher_ic_ciphertext', {
    p_teacher_id: parsed.data.teacher_id,
    p_reason: parsed.data.reason,
  });
  if (error) return dbError(error);
  const plain = decryptPii(data as string | null);
  if (!plain) return { ok: false, message: 'Tiada No. MyKad yang boleh dinyahsulit untuk guru ini.' };
  return { ok: true, value: `${plain.slice(0, 6)}-${plain.slice(6, 8)}-${plain.slice(8)}` };
}

export async function setUserRoleAction(raw: unknown): Promise<Result> {
  const c = await adminContext(true);
  if (!isCtx(c)) return c;
  const parsed = UserRoleSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  if (!canAssignRoles({ ...c.profile }, parsed.data.user_id)) return { ok: false, message: 'Anda tidak boleh menukar peranan sendiri.' };
  const { data, error } = await createServerSupabase()
    .from('profiles')
    .update({ role: parsed.data.role })
    .eq('id', parsed.data.user_id)
    .select('id')
    .maybeSingle();
  if (error) return dbError(error);
  if (!data) return { ok: false, message: 'Pengguna tidak ditemui.' };
  revalidatePath('/admin/users');
  return { ok: true, message: 'Peranan dikemas kini.' };
}

export async function setUserActiveAction(raw: unknown): Promise<Result> {
  const c = await adminContext(true);
  if (!isCtx(c)) return c;
  const parsed = UserActiveSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  if (parsed.data.user_id === c.profile.id) return { ok: false, message: 'Anda tidak boleh menukar status akaun sendiri.' };
  const { data, error } = await createServerSupabase()
    .from('profiles')
    .update({ is_active: parsed.data.active })
    .eq('id', parsed.data.user_id)
    .select('id')
    .maybeSingle();
  if (error) return dbError(error);
  if (!data) return { ok: false, message: 'Pengguna tidak ditemui.' };
  refreshAll();
  return { ok: true, message: parsed.data.active ? 'Akaun diaktifkan.' : 'Akaun dinyahaktifkan.' };
}

export async function updateInstitutionAction(raw: unknown): Promise<Result> {
  const c = await adminContext();
  if (!isCtx(c)) return c;
  const parsed = InstitutionUpdateSchema.safeParse(raw);
  if (!parsed.success) return invalid(parsed.error);
  const { id, ...changes } = parsed.data;
  if (Object.keys(changes).length === 0) return { ok: false, message: 'Tiada perubahan.' };
  const { data, error } = await createServerSupabase().from('institutions').update(changes).eq('id', id).select('id').maybeSingle();
  if (error) return dbError(error);
  if (!data) return { ok: false, message: 'Institusi tidak ditemui.' };
  revalidatePath('/admin/institutions');
  revalidatePath('/institutions');
  return { ok: true, message: 'Institusi dikemas kini.' };
}
