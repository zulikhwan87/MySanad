'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth/session';
import { consumeRateLimit } from '@/lib/rate-limit';
import { DOCUMENT_MIME, detectDocumentKind, isValidDocumentPath, kindFromPath } from '@/lib/files/document-signature';
import { RegisterDocumentSchema } from '@/lib/validations/document';
import { IdSchema } from '@/lib/validations/teacher';
import type { ActionResult } from '@/lib/validations/auth';

const BUCKET = 'private-ijazah-documents';
type Result = ActionResult & { id?: string };

function dbMessage(error: { code?: string; message: string }): string {
  if (['42501', '22023', 'P0002'].includes(error.code ?? '')) return error.message;
  if (error.code === '23514') return 'Jenis atau saiz fail tidak dibenarkan.';
  if (error.code === '23505') return 'Fail ini sudah didaftarkan.';
  console.error('[document-actions]', error.code, error.message);
  return 'Ralat pangkalan data. Sila cuba lagi.';
}

/**
 * Second half of an upload: the browser has put the file in <uid>/... of the private bucket.
 * We verify its real type from the first bytes, then register it atomically in the database.
 * Any failure removes the uploaded object so nothing unregistered is left behind.
 */
export async function registerDocumentAction(raw: unknown): Promise<Result> {
  const profile = await getSessionProfile();
  if (!profile?.is_active) return { ok: false, message: 'Sesi tamat. Sila log masuk semula.' };
  if (!(await consumeRateLimit('teacherWrite', `user:${profile.id}`))) {
    return { ok: false, message: 'Terlalu banyak permintaan. Sila tunggu sebentar.' };
  }
  const parsed = RegisterDocumentSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: 'Maklumat dokumen tidak sah.', fieldErrors: parsed.error.flatten().fieldErrors };
  const v = parsed.data;
  if (!isValidDocumentPath(v.storage_path, profile.id)) return { ok: false, message: 'Laluan fail tidak sah.' };

  const supabase = createServerSupabase();
  const bucket = supabase.storage.from(BUCKET);
  const discard = async (message: string): Promise<Result> => {
    await bucket.remove([v.storage_path]);
    return { ok: false, message };
  };

  // Read only the first bytes through a short-lived URL (owner-only by storage RLS).
  const signed = await bucket.createSignedUrl(v.storage_path, 30);
  if (signed.error || !signed.data) return discard('Fail tidak ditemui. Sila muat naik semula.');
  let head: Uint8Array;
  try {
    const res = await fetch(signed.data.signedUrl, { headers: { Range: 'bytes=0-15' }, cache: 'no-store' });
    if (!res.ok) return discard('Fail tidak dapat dibaca. Sila muat naik semula.');
    head = new Uint8Array(await res.arrayBuffer()).slice(0, 16);
  } catch {
    return discard('Fail tidak dapat dibaca. Sila muat naik semula.');
  }
  const kind = detectDocumentKind(head);
  if (!kind || kind !== kindFromPath(v.storage_path)) {
    return discard('Kandungan fail bukan PDF, JPEG, PNG atau WebP yang sah.');
  }

  const { data, error } = await supabase.rpc('register_my_document', {
    p_storage_path: v.storage_path,
    p_category: v.category,
    p_original_filename: v.original_filename,
    p_mime_type: DOCUMENT_MIME[kind], // from the file content, not the browser's claim
    p_file_size_bytes: v.file_size_bytes,
    p_sanad_chain_id: v.sanad_chain_id ?? null,
    p_ijazah_record_id: v.ijazah_record_id ?? null,
    p_notes: v.notes ?? null,
  });
  if (error) return discard(dbMessage(error));

  revalidatePath('/teacher/documents');
  revalidatePath('/teacher/verification');
  return { ok: true, message: 'Dokumen dimuat naik dan dihantar untuk semakan.', id: data as string };
}

export async function deleteDocumentAction(documentId: string): Promise<Result> {
  const profile = await getSessionProfile();
  if (!profile?.is_active) return { ok: false, message: 'Sesi tamat. Sila log masuk semula.' };
  if (!IdSchema.safeParse(documentId).success) return { ok: false, message: 'Rekod tidak sah.' };
  if (!(await consumeRateLimit('teacherWrite', `user:${profile.id}`))) {
    return { ok: false, message: 'Terlalu banyak permintaan. Sila tunggu sebentar.' };
  }
  const supabase = createServerSupabase();
  const { data: path, error } = await supabase.rpc('delete_my_document', { p_document_id: documentId });
  if (error) return { ok: false, message: dbMessage(error) };
  if (typeof path === 'string' && isValidDocumentPath(path, profile.id)) {
    const removed = await supabase.storage.from(BUCKET).remove([path]);
    if (removed.error) console.error('[document-actions] storage remove failed', removed.error.message);
  }
  revalidatePath('/teacher/documents');
  return { ok: true, message: 'Dokumen dipadam.' };
}
