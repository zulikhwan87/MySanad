import { z } from 'zod';
import { SanadNodeSchema } from './sanad';

const ARABIC = /[؀-ۿ]/;
const optional = (max: number) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : typeof v === 'string' ? v.trim() : v), z.string().max(max).optional());

export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

export const DistrictSchema = z.object({
  id: z.string().uuid().optional(),
  state_id: z.string().uuid('Pilih negeri.'),
  name: z.string().trim().min(2, 'Nama daerah diperlukan.').max(120),
});

const code = (max: number) =>
  z
    .string()
    .trim()
    .toUpperCase()
    .regex(new RegExp(`^[A-Z0-9-]{2,${max}}$`), 'Kod: huruf besar, nombor dan sengkang sahaja.');
const arabic = (label: string) => z.string().trim().min(1, `${label} (Arab) diperlukan.`).max(200).refine((v) => ARABIC.test(v), 'Gunakan tulisan Arab.');

export const QiraatSchema = z.object({
  id: z.string().uuid().optional(),
  code: code(30),
  imam_name_rumi: z.string().trim().min(2).max(150),
  imam_name_arabic: arabic('Nama imam'),
  title_rumi: z.string().trim().min(2).max(200),
  title_arabic: arabic('Tajuk'),
  era_hijri: optional(60),
  region_origin: optional(100),
  description: optional(2000),
  display_order: z.coerce.number().int().min(1).max(99),
});

export const RiwayatSchema = z.object({
  id: z.string().uuid().optional(),
  qiraat_id: z.string().uuid('Pilih qiraat.'),
  code: code(40),
  rawi_name_rumi: z.string().trim().min(2).max(150),
  rawi_name_arabic: arabic('Nama perawi'),
  full_label_rumi: z.string().trim().min(2).max(200),
  full_label_arabic: arabic('Label'),
  era_hijri: optional(60),
  description: optional(2000),
  display_order: z.coerce.number().int().min(1).max(99),
});

export const TariqSchema = z.object({
  id: z.string().uuid().optional(),
  riwayat_id: z.preprocess((v) => (v === '' ? undefined : v), z.string().uuid().optional()),
  code: code(50),
  name_rumi: z.string().trim().min(2).max(200),
  name_arabic: arabic('Nama'),
  source_book_rumi: optional(200),
  source_book_arabic: optional(200),
  description: optional(2000),
});

export const ReferenceNodeSchema = z.object({
  id: z.string().uuid().optional(),
  canonical_code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{3,60}$/, 'Kod rujukan: huruf besar, nombor dan sengkang (3–60).'),
  node: SanadNodeSchema,
});

export const SettingsSchema = z.object({
  registration_open: z.boolean(),
  announcement: z.string().trim().max(300, 'Maksimum 300 aksara.'),
  contact_email: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string().trim().email('Alamat emel tidak sah.').max(254).nullable(),
  ),
  max_documents_per_teacher: z.coerce.number().int('Nombor bulat sahaja.').min(1).max(200),
});
export type SettingsInput = z.input<typeof SettingsSchema>;
