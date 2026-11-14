/**
 * Server code for documents with Supabase mocked: the signed-URL route and registerDocumentAction.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const UID = '11111111-1111-4111-8111-111111111111';
const DOC = '33333333-3333-4333-8333-333333333333';
const PATH = `${UID}/abcdefghij0123456789.pdf`;

const state = vi.hoisted(() => ({
  user: null as null | { id: string },
  doc: null as null | Record<string, string>,
  rpc: vi.fn(),
  remove: vi.fn(),
  createSignedUrl: vi.fn(),
  serviceSign: vi.fn(),
  rateOk: true,
  fetchBytes: new Uint8Array(),
}));

vi.mock('@/lib/supabase/env', () => ({ getSupabasePublicEnv: () => ({ url: 'https://x.supabase.co', anonKey: 'anon' }) }));
vi.mock('@/lib/rate-limit', () => ({ consumeRateLimit: async () => state.rateOk }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/session', () => ({
  getSessionProfile: async () => (state.user ? { id: state.user.id, is_active: true, role: 'registered_teacher' } : null),
}));
vi.mock('@/lib/supabase/server', () => {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: state.doc, error: null }),
  };
  return {
    createServerSupabase: () => ({
      auth: { getUser: async () => ({ data: { user: state.user } }) },
      from: () => query,
      rpc: state.rpc,
      storage: { from: () => ({ remove: state.remove, createSignedUrl: state.createSignedUrl }) },
    }),
    createServiceRoleSupabase: () => ({ storage: { from: () => ({ createSignedUrl: state.serviceSign }) } }),
  };
});

import { GET } from '@/app/api/documents/[documentId]/signed-url/route';
import { registerDocumentAction } from '@/lib/actions/document-actions';

beforeEach(() => {
  state.user = { id: UID };
  state.doc = null;
  state.rateOk = true;
  state.rpc.mockReset().mockResolvedValue({ data: DOC, error: null });
  state.remove.mockReset().mockResolvedValue({ error: null });
  state.createSignedUrl.mockReset().mockResolvedValue({ data: { signedUrl: 'https://x/head' }, error: null });
  state.serviceSign.mockReset().mockResolvedValue({ data: { signedUrl: 'https://x/signed' }, error: null });
  state.fetchBytes = new TextEncoder().encode('%PDF-1.7 rest');
  vi.stubGlobal('fetch', vi.fn(async () => new Response(state.fetchBytes, { status: 206 })));
});

const req = (id: string, qs = '') => GET(new NextRequest(`http://localhost/api/documents/${id}/signed-url${qs}`), { params: { documentId: id } });

describe('GET /api/documents/[id]/signed-url', () => {
  it('requires login', async () => {
    state.user = null;
    expect((await req(DOC)).status).toBe(401);
  });

  it('rejects malformed ids', async () => {
    expect((await req('not-a-uuid')).status).toBe(400);
  });

  it('returns 404 when RLS hides the document (missing or not yours)', async () => {
    const res = await req(DOC);
    expect(res.status).toBe(404);
    expect(state.serviceSign).not.toHaveBeenCalled();
  });

  it('rate limits', async () => {
    state.rateOk = false;
    expect((await req(DOC)).status).toBe(429);
  });

  it('signs a 60-second URL, never cached, and audits the access', async () => {
    state.doc = { id: DOC, storage_bucket: 'private-ijazah-documents', storage_path: PATH, original_filename: 'sijil.pdf' };
    const res = await req(DOC);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual({ signedUrl: 'https://x/signed', expiresInSeconds: 60 });
    expect(state.serviceSign).toHaveBeenCalledWith(PATH, 60, undefined);
    expect(state.rpc).toHaveBeenCalledWith('log_audit_event', expect.objectContaining({ p_action: 'DOCUMENT_VIEW_URL', p_entity_id: DOC }));
  });

  it('can force a download with the original filename', async () => {
    state.doc = { id: DOC, storage_bucket: 'private-ijazah-documents', storage_path: PATH, original_filename: 'sijil.pdf' };
    await req(DOC, '?muat-turun=1');
    expect(state.serviceSign).toHaveBeenCalledWith(PATH, 60, { download: 'sijil.pdf' });
  });
});

describe('registerDocumentAction', () => {
  const input = { storage_path: PATH, category: 'Sijil Ijazah Sanad', original_filename: 'sijil.pdf', file_size_bytes: 1000 };

  it('rejects a path outside the caller folder without touching storage', async () => {
    const res = await registerDocumentAction({ ...input, storage_path: `22222222-2222-4222-8222-222222222222/abcdefghij0123456789.pdf` });
    expect(res.ok).toBe(false);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('reads only the first bytes and registers with the detected MIME type', async () => {
    const res = await registerDocumentAction(input);
    expect(res).toMatchObject({ ok: true, id: DOC });
    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(init.headers.Range).toBe('bytes=0-15');
    expect(state.rpc).toHaveBeenCalledWith('register_my_document', expect.objectContaining({ p_mime_type: 'application/pdf', p_storage_path: PATH }));
    expect(state.remove).not.toHaveBeenCalled();
  });

  it('deletes the upload when the content is not a real document', async () => {
    state.fetchBytes = new TextEncoder().encode('<html>not a pdf');
    const res = await registerDocumentAction(input);
    expect(res.ok).toBe(false);
    expect(state.remove).toHaveBeenCalledWith([PATH]);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('deletes the upload when the content does not match the extension', async () => {
    state.fetchBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]); // JPEG bytes in a .pdf path
    const res = await registerDocumentAction(input);
    expect(res.ok).toBe(false);
    expect(state.remove).toHaveBeenCalledWith([PATH]);
  });

  it('deletes the upload when the database refuses it', async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'Rekod ijazah bukan milik anda.' } });
    const res = await registerDocumentAction({ ...input, ijazah_record_id: DOC });
    expect(res).toEqual({ ok: false, message: 'Rekod ijazah bukan milik anda.' });
    expect(state.remove).toHaveBeenCalledWith([PATH]);
  });
});
