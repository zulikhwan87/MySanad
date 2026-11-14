'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth/session';
import { IdSchema } from '@/lib/validations/teacher';
import type { ActionResult } from '@/lib/validations/auth';

async function owner() {
  const profile = await getSessionProfile();
  return profile ? { id: profile.id, supabase: createServerSupabase() } : null;
}

export async function markNotificationReadAction(id: string): Promise<ActionResult> {
  const o = await owner();
  if (!o || !IdSchema.safeParse(id).success) return { ok: false, message: 'Tidak sah.' };
  const { error } = await o.supabase.from('notifications').update({ is_read: true }).eq('id', id).eq('recipient_profile_id', o.id);
  if (error) return { ok: false, message: 'Gagal dikemas kini.' };
  revalidatePath('/teacher', 'layout');
  return { ok: true };
}

export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  const o = await owner();
  if (!o) return { ok: false, message: 'Tidak sah.' };
  const { error } = await o.supabase.from('notifications').update({ is_read: true }).eq('recipient_profile_id', o.id).eq('is_read', false);
  if (error) return { ok: false, message: 'Gagal dikemas kini.' };
  revalidatePath('/teacher', 'layout');
  return { ok: true, message: 'Semua notifikasi ditanda sebagai dibaca.' };
}

export async function deleteNotificationAction(id: string): Promise<ActionResult> {
  const o = await owner();
  if (!o || !IdSchema.safeParse(id).success) return { ok: false, message: 'Tidak sah.' };
  const { error } = await o.supabase.from('notifications').delete().eq('id', id).eq('recipient_profile_id', o.id);
  if (error) return { ok: false, message: 'Gagal dipadam.' };
  revalidatePath('/teacher', 'layout');
  return { ok: true };
}
