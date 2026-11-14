import { z } from 'zod';

export const PAGE_SIZE = 12;

type RawParams = Record<string, string | string[] | undefined>;

const optionalUuid = z.string().uuid().optional().catch(undefined);

export const DirectoryParamsSchema = z.object({
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .catch(undefined)
    .transform((v) => (v ? v : undefined)),
  negeri: z
    .string()
    .regex(/^[a-z-]{2,60}$/)
    .optional()
    .catch(undefined),
  daerah: optionalUuid,
  qiraat: optionalUuid,
  riwayat: optionalUuid,
  institusi: optionalUuid,
  halaman: z.coerce.number().int().min(1).max(10_000).catch(1).default(1),
});

export type DirectoryParams = z.infer<typeof DirectoryParamsSchema>;

/** Next.js searchParams -> validated params. Invalid values are dropped, never thrown. */
export function parseDirectoryParams(raw: RawParams): DirectoryParams {
  const first = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  return DirectoryParamsSchema.parse(first);
}

/** Build a query string from params, applying overrides; resets to page 1 when filters change. */
export function directoryHref(
  basePath: string,
  params: Partial<DirectoryParams>,
  overrides: Partial<Record<keyof DirectoryParams, string | number | undefined>> = {},
): string {
  const merged: Record<string, string | number | undefined> = { ...params, ...overrides };
  const filterChanged = Object.keys(overrides).some((k) => k !== 'halaman');
  if (filterChanged && !('halaman' in overrides)) merged.halaman = undefined;
  const qs = new URLSearchParams();
  for (const key of ['q', 'negeri', 'daerah', 'qiraat', 'riwayat', 'institusi', 'halaman'] as const) {
    const value = merged[key];
    if (value === undefined || value === '' || (key === 'halaman' && Number(value) <= 1)) continue;
    qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `${basePath}?${s}` : basePath;
}

export function pageCount(total: number, pageSize = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Escape LIKE wildcards so user input is matched literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export const UuidSchema = z.string().uuid();
