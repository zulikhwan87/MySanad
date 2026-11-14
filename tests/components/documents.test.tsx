// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
const actions = vi.hoisted(() => ({ registerDocumentAction: vi.fn(), deleteDocumentAction: vi.fn() }));
vi.mock('@/lib/actions/document-actions', () => actions);
const upload = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ storage: { from: () => ({ upload }) } }) }));

import { DocumentUploader } from '@/components/documents/document-uploader';
import { DocumentList, type DocumentRow } from '@/components/documents/document-list';
import { isValidDocumentPath } from '@/lib/files/document-signature';

const UID = '11111111-1111-4111-8111-111111111111';

function pick(file: File) {
  fireEvent.change(screen.getByLabelText(/^Fail/), { target: { files: [file] } });
}

beforeEach(() => {
  actions.registerDocumentAction.mockReset().mockResolvedValue({ ok: true, message: 'Dokumen dimuat naik dan dihantar untuk semakan.' });
  actions.deleteDocumentAction.mockReset();
  upload.mockReset().mockResolvedValue({ error: null });
});

describe('DocumentUploader', () => {
  const renderIt = () => render(<DocumentUploader userId={UID} targets={{ ijazah: [], chains: [] }} defaults={{ category: 'Sijil Akademik' }} />);

  it('rejects disguised files before anything is uploaded', async () => {
    renderIt();
    pick(new File(['<html>bukan pdf'], 'sijil.pdf', { type: 'application/pdf' }));
    fireEvent.click(screen.getByRole('button', { name: /Muat naik/ }));
    expect(await screen.findByText(/Hanya fail PDF, JPEG, PNG atau WebP/)).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
  });

  it('rejects files over 15 MB before uploading', async () => {
    renderIt();
    const big = new File(['%PDF-'], 'besar.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: 16 * 1024 * 1024 });
    pick(big);
    fireEvent.click(screen.getByRole('button', { name: /Muat naik/ }));
    expect(await screen.findByText(/antara 1 bait dan 15 MB/)).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
  });

  it('uploads to a random path in the owner folder, then registers', async () => {
    renderIt();
    pick(new File(['%PDF-1.7 kandungan'], 'Sijil Ijazah.pdf', { type: 'application/pdf' }));
    fireEvent.click(screen.getByRole('button', { name: /Muat naik/ }));
    await waitFor(() => expect(actions.registerDocumentAction).toHaveBeenCalled());
    const [path, , options] = upload.mock.calls[0];
    expect(isValidDocumentPath(path, UID)).toBe(true);
    expect(path).not.toContain('Sijil');
    expect(options).toMatchObject({ contentType: 'application/pdf', upsert: false });
    expect(actions.registerDocumentAction.mock.calls[0][0]).toMatchObject({ storage_path: path, original_filename: 'Sijil Ijazah.pdf', category: 'Sijil Akademik' });
    expect(await screen.findByText(/dihantar untuk semakan/)).toBeInTheDocument();
  });

  it('requires a category', async () => {
    render(<DocumentUploader userId={UID} targets={{ ijazah: [], chains: [] }} defaults={{}} />);
    fireEvent.click(screen.getByRole('button', { name: /Muat naik/ }));
    expect(await screen.findByText('Pilih kategori dokumen.')).toBeInTheDocument();
  });
});

describe('DocumentList', () => {
  const doc = (over: Partial<DocumentRow> = {}): DocumentRow => ({
    id: '33333333-3333-4333-8333-333333333333',
    category: 'Sijil Ijazah Sanad',
    original_filename: 'sijil.pdf',
    mime_type: 'application/pdf',
    file_size_bytes: 2048,
    review_status: 'submitted',
    review_notes: null,
    uploaded_at: '2026-01-01T00:00:00Z',
    link: 'Ijazah: Hafs',
    ...over,
  });

  it('opens a fresh signed URL in a new tab without the opener', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ signedUrl: 'https://x/signed' }), { status: 200 })));
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<DocumentList documents={[doc()]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lihat sijil.pdf' }));
    await waitFor(() => expect(open).toHaveBeenCalledWith('https://x/signed', '_blank', 'noopener,noreferrer'));
  });

  it('only offers delete before review starts', () => {
    render(<DocumentList documents={[doc(), doc({ id: '44444444-4444-4444-8444-444444444444', original_filename: 'lulus.pdf', review_status: 'approved' })]} />);
    expect(screen.getByRole('button', { name: 'Padam sijil.pdf' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Padam lulus.pdf' })).toBeNull();
  });

  it('asks for confirmation before deleting', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<DocumentList documents={[doc()]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Padam sijil.pdf' }));
    expect(actions.deleteDocumentAction).not.toHaveBeenCalled();
  });
});
