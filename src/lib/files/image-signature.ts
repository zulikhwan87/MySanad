export type ImageKind = 'jpeg' | 'png' | 'webp';

export const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const PHOTO_MIME: Record<ImageKind, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
export const PHOTO_EXT: Record<ImageKind, string> = { jpeg: 'jpg', png: 'png', webp: 'webp' };

/** Identify an image by its magic bytes (never trust the declared MIME type alone). */
export function detectImageKind(bytes: Uint8Array): ImageKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return 'png';
  const ascii = (from: number, to: number) => String.fromCharCode(...Array.from(bytes.slice(from, to)));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  return null;
}

/** Storage object path for a teacher photo: "<uid>/avatar-<random>.<ext>". */
export function isValidPhotoPath(path: string, userId: string): boolean {
  const escaped = userId.replace(/[-]/g, '\\-');
  return new RegExp(`^${escaped}/avatar-[a-z0-9]{8,40}\\.(jpg|png|webp)$`).test(path);
}
