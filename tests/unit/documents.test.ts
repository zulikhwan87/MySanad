import { describe, expect, it } from 'vitest';
import { detectDocumentKind, formatBytes, isValidDocumentPath, kindFromPath } from '@/lib/files/document-signature';
import { RegisterDocumentSchema } from '@/lib/validations/document';

const UID = '11111111-1111-4111-8111-111111111111';
const enc = (s: string) => new TextEncoder().encode(s);

describe('detectDocumentKind', () => {
  it('recognises PDF and images by content', () => {
    expect(detectDocumentKind(enc('%PDF-1.7\n'))).toBe('pdf');
    expect(detectDocumentKind(new Uint8Array([0xff, 0xd8, 0xff, 0xdb]))).toBe('jpeg');
    expect(detectDocumentKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
    expect(detectDocumentKind(enc('RIFF\0\0\0\0WEBPVP8 '))).toBe('webp');
  });

  it('rejects disguised or dangerous files', () => {
    expect(detectDocumentKind(enc('<html><script>'))).toBeNull();
    expect(detectDocumentKind(enc('MZ\x90\x00'))).toBeNull(); // Windows executable
    expect(detectDocumentKind(enc('PK\x03\x04'))).toBeNull(); // zip / docx
    expect(detectDocumentKind(enc(' %PDF-'))).toBeNull(); // signature must be at offset 0
    expect(detectDocumentKind(new Uint8Array())).toBeNull();
  });
});

describe('document paths', () => {
  it('accepts only random names inside the owner folder', () => {
    expect(isValidDocumentPath(`${UID}/abcdefghij0123456789.pdf`, UID)).toBe(true);
    expect(isValidDocumentPath(`${UID}/short.pdf`, UID)).toBe(false);
    expect(isValidDocumentPath(`${UID}/abcdefghij0123456789.exe`, UID)).toBe(false);
    expect(isValidDocumentPath(`22222222-2222-4222-8222-222222222222/abcdefghij0123456789.pdf`, UID)).toBe(false);
    expect(isValidDocumentPath(`${UID}/../abcdefghij0123456789.pdf`, UID)).toBe(false);
  });

  it('maps extensions to kinds', () => {
    expect(kindFromPath('x/abc.jpg')).toBe('jpeg');
    expect(kindFromPath('x/abc.pdf')).toBe('pdf');
    expect(kindFromPath('x/abc.gif')).toBeNull();
  });

  it('formats sizes', () => {
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(15 * 1024 * 1024)).toBe('15.0 MB');
  });
});

describe('RegisterDocumentSchema', () => {
  const base = { storage_path: `${UID}/abcdefghij0123456789.pdf`, category: 'Sijil Akademik', original_filename: 'a.pdf', file_size_bytes: 10 };
  it('validates category, size and optional links', () => {
    expect(RegisterDocumentSchema.safeParse(base).success).toBe(true);
    expect(RegisterDocumentSchema.safeParse({ ...base, category: 'Lain' }).success).toBe(false);
    expect(RegisterDocumentSchema.safeParse({ ...base, file_size_bytes: 16 * 1024 * 1024 }).success).toBe(false);
    expect(RegisterDocumentSchema.safeParse({ ...base, ijazah_record_id: 'bukan-uuid' }).success).toBe(false);
    const empty = RegisterDocumentSchema.parse({ ...base, ijazah_record_id: '', notes: '  ' });
    expect(empty.ijazah_record_id).toBeUndefined();
    expect(empty.notes).toBeUndefined();
  });
});
