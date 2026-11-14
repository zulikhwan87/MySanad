import { z } from 'zod';

export const GENERATION_CATEGORIES = [
  'Rasulullah SAW',
  'Sahabat',
  "Tabi'in",
  'Imam Qiraat',
  'Perawi',
  'Ulama Qiraat Klasik',
  'Masyaikh Mutaakhirin',
  'Guru Nusantara / Semasa',
] as const;

export const TRANSMISSION_RELATIONSHIPS = [
  'Talaqqi wa al-Ardh',
  "Talaqqi Musyafahah Khatam 30 Juzuk",
  "Sama'",
  'Qiraah sebahagian dengan ijazah penuh',
  'Ijazah am',
  'Lain-lain',
] as const;

const ARABIC = /[؀-ۿ]/;

const text = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : typeof v === 'string' ? v.trim() : v),
    z.string().max(max, `Maksimum ${max} aksara.`).optional(),
  );
const optionalUuid = z.preprocess((v) => (v === '' || v === null ? undefined : v), z.string().uuid('Pilihan tidak sah.').optional());
/** `separator`: commas+lines for names, lines only for citations (which often contain commas). */
const list = (maxItems: number, maxLen: number, separator: RegExp = /[\n,;]/) =>
  z.preprocess(
    (v) =>
      typeof v === 'string'
        ? Array.from(new Set(v.split(separator).map((s) => s.trim()).filter(Boolean)))
        : Array.isArray(v)
          ? v
          : [],
    z.array(z.string().max(maxLen, `Setiap item maksimum ${maxLen} aksara.`)).max(maxItems, `Maksimum ${maxItems} item.`),
  );
const optionalYear = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
  z.number().int('Tahun tidak sah.').min(-700).max(new Date().getFullYear()).optional(),
);

export const SanadNodeSchema = z
  .object({
    full_name_rumi: z.string().trim().min(2, 'Nama (Rumi) diperlukan.').max(255),
    full_name_arabic: text(255).refine((v) => !v || ARABIC.test(v), 'Gunakan tulisan Arab.'),
    alternative_spellings: list(10, 120),
    historical_title: text(200),
    generation_category: z.enum(GENERATION_CATEGORIES, { errorMap: () => ({ message: 'Pilih kategori generasi.' }) }),
    birth_year_hijri: text(30),
    death_year_hijri: text(30),
    birth_year_miladi: optionalYear,
    death_year_miladi: optionalYear,
    country_or_region: text(150),
    biography: text(5000),
    scholarly_references: list(20, 300, /\n/),
  })
  .refine((v) => !v.birth_year_miladi || !v.death_year_miladi || v.death_year_miladi >= v.birth_year_miladi, {
    path: ['death_year_miladi'],
    message: 'Tahun wafat mesti selepas tahun lahir.',
  });

export const SanadEdgeSchema = z.object({
  transmission_relationship: z.string().trim().min(2, 'Nyatakan jenis pengambilan.').max(150),
  riwayat_context: text(200),
  transmission_date_text: text(100),
  transmission_location: text(200),
  sequence_order: z.coerce.number().int().min(1).max(999).default(1),
  supporting_evidence: text(2000),
  notes: text(2000),
});

export const NodeChoiceSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('existing'), node_id: z.string().uuid('Pilih perawi daripada senarai.') }),
  z.object({ mode: z.literal('new'), node: SanadNodeSchema }),
]);

export const SanadChainSchema = z.object({
  title: z.string().trim().min(3, 'Tajuk sekurang-kurangnya 3 aksara.').max(255),
  qiraat_id: z.string({ required_error: 'Qiraat diperlukan.' }).uuid('Qiraat diperlukan.'),
  riwayat_id: z.string({ required_error: 'Riwayat diperlukan.' }).uuid('Riwayat diperlukan.'),
  tariq_id: optionalUuid,
  transmission_method: z.string().trim().min(3, 'Nyatakan kaedah pengambilan.').max(150),
  ijazah_date: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarikh tidak sah.')
      .refine((d) => !Number.isNaN(Date.parse(d)) && Date.parse(d) <= Date.now(), 'Tarikh tidak boleh pada masa hadapan.')
      .optional(),
  ),
  ijazah_location: text(255),
  public_notes: text(2000),
  allow_public_graph_export: z.boolean().default(false),
});

export const NewSanadChainSchema = z.object({
  chain: SanadChainSchema,
  shaykh: NodeChoiceSchema,
  edge: SanadEdgeSchema,
});

export type SanadNodeInput = z.input<typeof SanadNodeSchema>;
export type SanadEdgeInput = z.input<typeof SanadEdgeSchema>;
export type SanadChainInput = z.input<typeof SanadChainSchema>;
export type NodeChoiceInput = z.input<typeof NodeChoiceSchema>;
