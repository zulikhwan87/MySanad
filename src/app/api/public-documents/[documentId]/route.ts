import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceRoleSupabase, isServiceRoleConfigured } from '@/lib/supabase/server';
import { clientIp, consumeRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const SIGNED_URL_TTL_SECONDS = 60;
const DocumentId = z.string().uuid();
const NO_STORE = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

/**
 * Opens a sanad certificate shown on a public profile. Only documents the teacher asked to show,
 * that an administrator approved, and whose teacher profile is public resolve
 * (public_sanad_document_path, service role only); everything else is the same 404.
 * The visitor is redirected to a 60-second signed URL; the bucket itself stays private.
 */
export async function GET(_request: Request, { params }: { params: { documentId: string } }) {
  if (!isServiceRoleConfigured()) {
    return NextResponse.json({ error: 'Perkhidmatan tidak dikonfigurasi.' }, { status: 503, headers: NO_STORE });
  }
  const id = DocumentId.safeParse(params.documentId);
  if (!id.success) return NextResponse.json({ error: 'ID dokumen tidak sah.' }, { status: 400, headers: NO_STORE });

  if (!(await consumeRateLimit('publicDocument', `ip:${clientIp()}`))) {
    return NextResponse.json({ error: 'Terlalu banyak permintaan.' }, { status: 429, headers: NO_STORE });
  }

  const service = createServiceRoleSupabase();
  const { data: path, error: pathError } = await service.rpc('public_sanad_document_path', { p_document_id: id.data });
  if (pathError) return NextResponse.json({ error: 'Gagal membaca dokumen.' }, { status: 500, headers: NO_STORE });
  if (typeof path !== 'string' || !path) {
    return NextResponse.json({ error: 'Dokumen tidak ditemui.' }, { status: 404, headers: NO_STORE });
  }

  const { data: signed, error } = await service.storage.from('private-ijazah-documents').createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !signed) return NextResponse.json({ error: 'Gagal menjana pautan selamat.' }, { status: 500, headers: NO_STORE });

  return NextResponse.redirect(signed.signedUrl, { status: 302, headers: NO_STORE });
}
