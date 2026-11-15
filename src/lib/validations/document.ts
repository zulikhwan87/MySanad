import { z } from 'zod';
import { DOCUMENT_MAX_BYTES } from '@/lib/files/document-signature';

export const DOCUMENT_CATEGORIES = [
  'Sijil Ijazah Sanad',
  'Dokumen Sokongan Talaqqi',
  'Sijil Akademik',
  'Pengesahan Institusi',
  'Dokumen Pengenalan',
] as const;

const optionalUuid = z.preprocess((v) => (v === '' || v === null ? undefined : v), z.string().uuid().optional());

export const RegisterDocumentSchema = z.object({
  storage_path: z.string().min(1).max(200),
  category: z.enum(DOCUMENT_CATEGORIES, { errorMap: () => ({ message: 'Pilih kategori dokumen.' }) }),
  original_filename: z.string().trim().min(1).max(255),
  file_size_bytes: z.number().int().positive().max(DOCUMENT_MAX_BYTES, 'Saiz fail melebihi 15 MB.'),
  sanad_chain_id: optionalUuid,
  ijazah_record_id: optionalUuid,
  notes: z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().max(1000).optional()),
  show_publicly: z.boolean().optional().default(false),
}).refine((v) => !v.show_publicly || v.category === 'Sijil Ijazah Sanad', {
  message: 'Hanya Sijil Ijazah Sanad boleh dipaparkan kepada awam.',
  path: ['show_publicly'],
});

export type RegisterDocumentInput = z.input<typeof RegisterDocumentSchema>;
