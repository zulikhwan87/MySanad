import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * Only renders photos from MySanad's own public photo bucket. A teacher-supplied
 * arbitrary URL could be used to track visitors, so anything else falls back to initials.
 */
export function isTrustedPhotoUrl(url: string | null | undefined): url is string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !base) return false;
  try {
    const prefix = `${new URL(base).origin}/storage/v1/object/public/teacher-photos/`;
    return url.startsWith(prefix) && !url.includes('..');
  } catch {
    return false;
  }
}

export function initials(name: string): string {
  const words = name
    .replace(/\(.*?\)/g, '')
    .split(/\s+/)
    .filter((w) => w && !/^(bin|binti|bt|b|al|el|ibn)$/i.test(w) && /^[\p{L}]/u.test(w));
  return (words[0]?.[0] ?? '?').toUpperCase() + (words[1]?.[0] ?? '').toUpperCase();
}

export function TeacherAvatar({ name, photoUrl, size = 56, className }: { name: string; photoUrl: string | null; size?: number; className?: string }) {
  if (isTrustedPhotoUrl(photoUrl)) {
    return (
      <Image
        src={photoUrl}
        alt={`Foto ${name}`}
        width={size}
        height={size}
        unoptimized
        className={cn('shrink-0 rounded-2xl object-cover', className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn('flex shrink-0 items-center justify-center rounded-2xl bg-forest-100 font-semibold text-forest-800', className)}
      style={{ width: size, height: size, fontSize: size / 2.8 }}
    >
      {initials(name)}
    </span>
  );
}
