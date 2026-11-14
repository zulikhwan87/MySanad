import { detectImageKind } from './image-signature';

export type DocumentKind = 'pdf' | 'jpeg' | 'png' | 'webp';

export const DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;
export const DOCUMENT_MIME: Record<DocumentKind, string> = {
  pdf: 'application/pdf',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
export const DOCUMENT_EXT: Record<DocumentKind, string> = { pdf: 'pdf', jpeg: 'jpg', png: 'png', webp: 'webp' };
export const DOCUMENT_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp';

/** Identify by magic bytes; the declared MIME type and file extension are never trusted. */
export function detectDocumentKind(bytes: Uint8Array): DocumentKind | null {
  if (bytes.length >= 5 && String.fromCharCode(...Array.from(bytes.slice(0, 5))) === '%PDF-') return 'pdf';
  return detectImageKind(bytes);
}

/** "<uid>/<16-64 chars [a-z0-9-]>.<ext>" — mirrors register_my_document() in migration 009. */
export function isValidDocumentPath(path: string, userId: string): boolean {
  const escaped = userId.replace(/[-]/g, '\\-');
  return new RegExp(`^${escaped}/[a-z0-9-]{16,64}\\.(pdf|jpg|png|webp)$`).test(path);
}

export function kindFromPath(path: string): DocumentKind | null {
  const ext = path.split('.').pop();
  return (Object.entries(DOCUMENT_EXT).find(([, e]) => e === ext)?.[0] as DocumentKind | undefined) ?? null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
