import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createServerSupabase, createServiceRoleSupabase } from '@/lib/supabase/server';
import { getSupabasePublicEnv } from '@/lib/supabase/env';
import { consumeRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const SIGNED_URL_TTL_SECONDS = 60;
const DocumentId = z.string().uuid();
const NO_STORE = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

/**
 * Short-lived link to a private document. Authorisation comes from RLS on public.documents
 * (owner or administrator only), so another user's ID returns the same 404 as a missing one.
 * `?muat-turun=1` asks the browser to download using the original filename.
 */
export async function GET(request: NextRequest, { params }: { params: { documentId: string } }) {
  if (!getSupabasePublicEnv()) {
    return NextResponse.json({ error: 'Perkhidmatan tidak dikonfigurasi.' }, { status: 503, headers: NO_STORE });
  }

  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Log masuk diperlukan.' }, { status: 401, headers: NO_STORE });

  const id = DocumentId.safeParse(params.documentId);
  if (!id.success) return NextResponse.json({ error: 'ID dokumen tidak sah.' }, { status: 400, headers: NO_STORE });

  if (!(await consumeRateLimit('signedUrl', `user:${user.id}`))) {
    return NextResponse.json({ error: 'Terlalu banyak permintaan.' }, { status: 429, headers: NO_STORE });
  }

  const { data: doc } = await supabase
    .from('documents')
    .select('id, storage_bucket, storage_path, original_filename')
    .eq('id', id.data)
    .maybeSingle();
  if (!doc) return NextResponse.json({ error: 'Dokumen tidak ditemui.' }, { status: 404, headers: NO_STORE });

  const download = request.nextUrl.searchParams.get('muat-turun') === '1';
  const { data: signed, error } = await createServiceRoleSupabase()
    .storage.from(doc.storage_bucket)
    .createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS, download ? { download: doc.original_filename } : undefined);
  if (error || !signed) return NextResponse.json({ error: 'Gagal menjana pautan selamat.' }, { status: 500, headers: NO_STORE });

  await supabase.rpc('log_audit_event', {
    p_action: download ? 'DOCUMENT_DOWNLOAD_URL' : 'DOCUMENT_VIEW_URL',
    p_entity_table: 'documents',
    p_entity_id: doc.id,
  });

  return NextResponse.json({ signedUrl: signed.signedUrl, expiresInSeconds: SIGNED_URL_TTL_SECONDS }, { headers: NO_STORE });
}
