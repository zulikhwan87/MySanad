import { z } from 'zod';

const ARABIC = /[؀-ۿ]/;

/** '' / whitespace -> undefined, otherwise trimmed. */
const optionalText = (max: number, message = `Maksimum ${max} aksara.`) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : typeof v === 'string' ? v.trim() : v),
    z.string().max(max, message).optional(),
  );

const optionalUuid = z.preprocess((v) => (v === '' || v === null ? undefined : v), z.string().uuid('Pilihan tidak sah.').optional());

const requiredText = (min: number, max: number, label: string) =>
  z
    .string({ required_error: `${label} diperlukan.` })
    .trim()
    .min(min, `${label} sekurang-kurangnya ${min} aksara.`)
    .max(max, `${label} maksimum ${max} aksara.`);

/** Comma/newline-separated list -> unique trimmed array. */
const textList = (maxItems: number, maxLen: number) =>
  z.preprocess(
    (v) =>
      typeof v === 'string'
        ? Array.from(new Set(v.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)))
        : Array.isArray(v)
          ? v
          : [],
    z.array(z.string().max(maxLen, `Setiap item maksimum ${maxLen} aksara.`)).max(maxItems, `Maksimum ${maxItems} item.`),
  );

/** Malaysian MyKad: YYMMDD-PB-###G with a real calendar date. Returns 12 digits. */
export function normalizeMyKad(input: string): string | null {
  const digits = input.replace(/[\s-]/g, '');
  if (!/^\d{12}$/.test(digits)) return null;
  const mm = Number(digits.slice(2, 4));
  const dd = Number(digits.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1) return null;
  const daysInMonth = new Date(2000, mm, 0).getDate(); // leap-year safe upper bound
  return dd <= daysInMonth ? digits : null;
}

/** Malaysian mobile/landline -> +60 E.164-ish, or null. */
export function normalizeMyPhone(input: string): string | null {
  const s = input.replace(/[\s()-]/g, '');
  const local = s.startsWith('+60') ? s.slice(3) : s.startsWith('60') ? s.slice(2) : s.startsWith('0') ? s.slice(1) : null;
  if (!local || !/^\d{8,10}$/.test(local)) return null;
  return `+60${local}`;
}

export const GENDERS = ['Lelaki', 'Perempuan'] as const;

export const PersonalStepSchema = z.object({
  full_name_rumi: requiredText(3, 255, 'Nama penuh'),
  full_name_arabic: optionalText(255).refine((v) => !v || ARABIC.test(v), 'Gunakan tulisan Arab.'),
  public_display_name: requiredText(3, 255, 'Nama paparan awam'),
  professional_title: optionalText(150),
  gender: z.preprocess((v) => (v === '' ? undefined : v), z.enum(GENDERS).optional()),
  alternative_spellings: textList(10, 100),
  ic_number: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z
      .string()
      .optional()
      .transform((v, ctx) => {
        if (v === undefined) return undefined;
        const n = normalizeMyKad(v);
        if (!n) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'No. MyKad tidak sah (contoh: 880101-03-1234).' });
        return n ?? undefined;
      }),
  ),
  private_phone: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z
      .string()
      .optional()
      .transform((v, ctx) => {
        if (v === undefined) return undefined;
        const n = normalizeMyPhone(v);
        if (!n) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Nombor telefon Malaysia tidak sah.' });
        return n ?? undefined;
      }),
  ),
  residential_state_id: optionalUuid,
  residential_district_id: optionalUuid,
  residential_address: optionalText(500),
});

export const PrivateContactSchema = PersonalStepSchema.pick({
  private_phone: true,
  residential_state_id: true,
  residential_district_id: true,
  residential_address: true,
});

export const QualificationsStepSchema = z.object({
  primary_qiraat_id: z.string({ required_error: 'Qiraat utama diperlukan.' }).uuid('Qiraat utama diperlukan.'),
  primary_riwayat_id: optionalUuid,
  specializations: textList(10, 80),
});

export const INSTITUTION_CATEGORIES = [
  'Universiti Awam',
  'Universiti Swasta',
  'Maahad Tahfiz',
  'Pondok Pengajian',
  'Masjid / Pusat Islam',
  'Institut Pendidikan',
  'Lain-lain',
] as const;

export const TeachingStepSchema = z
  .object({
    teaching_state_id: z.string({ required_error: 'Negeri mengajar diperlukan.' }).uuid('Negeri mengajar diperlukan.'),
    teaching_district_id: optionalUuid,
    primary_institution_id: optionalUuid,
    new_institution_name: optionalText(255),
    new_institution_category: z.preprocess((v) => (v === '' ? undefined : v), z.enum(INSTITUTION_CATEGORIES).optional()),
    teaching_experience_years: z.coerce.number().int('Nombor bulat sahaja.').min(0).max(80, 'Maksimum 80 tahun.'),
    short_bio: requiredText(30, 500, 'Biografi ringkas'),
    full_biography: optionalText(5000),
    accepting_students: z.boolean().default(true),
  })
  .refine((v) => !(v.new_institution_name && !v.new_institution_category), {
    path: ['new_institution_category'],
    message: 'Pilih kategori institusi baharu.',
  })
  .refine((v) => !(v.new_institution_name && v.new_institution_name.length < 3), {
    path: ['new_institution_name'],
    message: 'Nama institusi sekurang-kurangnya 3 aksara.',
  });

export const VisibilityStepSchema = z.object({
  show_photo: z.boolean(),
  show_institution: z.boolean(),
  show_education: z.boolean(),
  show_ijazah_dates: z.boolean(),
  show_sanad_graph: z.boolean(),
  allow_graph_download: z.boolean(),
  show_public_contact: z.boolean(),
  accepting_students: z.boolean(),
});

export const QUALIFICATION_LEVELS = [
  'Sijil',
  'Diploma',
  'Ijazah Sarjana Muda',
  'Ijazah Sarjana',
  'Doktor Falsafah',
  'Pengajian Pondok / Tradisional',
  'Lain-lain',
] as const;

const year = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
  z.number().int().min(1940, 'Tahun tidak sah.').max(new Date().getFullYear() + 6, 'Tahun tidak sah.').optional(),
);

export const EducationSchema = z
  .object({
    institution_name: requiredText(3, 255, 'Nama institusi'),
    country: requiredText(2, 100, 'Negara'),
    qualification_level: z.enum(QUALIFICATION_LEVELS, { errorMap: () => ({ message: 'Pilih tahap kelayakan.' }) }),
    field_of_study: requiredText(2, 200, 'Bidang pengajian'),
    start_year: year,
    graduation_year: year,
    is_public: z.boolean().default(true),
  })
  .refine((v) => !v.start_year || !v.graduation_year || v.graduation_year >= v.start_year, {
    path: ['graduation_year'],
    message: 'Tahun tamat mesti selepas tahun mula.',
  });

export const IjazahSchema = z.object({
  ijazah_title: requiredText(3, 255, 'Tajuk ijazah'),
  granting_sheikh_rumi: requiredText(3, 255, 'Nama syeikh'),
  granting_sheikh_arabic: optionalText(255).refine((v) => !v || ARABIC.test(v), 'Gunakan tulisan Arab.'),
  granting_institution: optionalText(255),
  qiraat_id: optionalUuid,
  riwayat_id: optionalUuid,
  tariq_id: optionalUuid,
  conferral_date: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarikh tidak sah.')
      .refine((d) => !Number.isNaN(Date.parse(d)) && Date.parse(d) <= Date.now(), 'Tarikh tidak boleh pada masa hadapan.')
      .optional(),
  ),
  conferral_place: optionalText(200),
  show_date_publicly: z.boolean().default(true),
});

export const IdSchema = z.string().uuid();

export type PersonalStepInput = z.input<typeof PersonalStepSchema>;
export type QualificationsStepInput = z.input<typeof QualificationsStepSchema>;
export type TeachingStepInput = z.input<typeof TeachingStepSchema>;
export type VisibilityStepInput = z.infer<typeof VisibilityStepSchema>;
export type EducationInput = z.input<typeof EducationSchema>;
export type IjazahInput = z.input<typeof IjazahSchema>;
export type PrivateContactInput = z.input<typeof PrivateContactSchema>;

/** Fields a published teacher may propose through a change request (mirrors the DB whitelist). */
export const CHANGE_REQUEST_FIELDS = [
  'full_name_rumi',
  'full_name_arabic',
  'public_display_name',
  'alternative_spellings',
  'professional_title',
  'gender',
  'teaching_state_id',
  'teaching_district_id',
  'primary_institution_id',
  'photo_url',
  'short_bio',
  'full_biography',
  'teaching_experience_years',
  'specializations',
  'primary_qiraat_id',
  'primary_riwayat_id',
] as const;
export type ChangeRequestField = (typeof CHANGE_REQUEST_FIELDS)[number];

/** Only changed, whitelisted fields; arrays compared by value. */
export function diffForChangeRequest(
  current: Partial<Record<ChangeRequestField, unknown>>,
  proposed: Partial<Record<ChangeRequestField, unknown>>,
): Partial<Record<ChangeRequestField, unknown>> {
  const out: Partial<Record<ChangeRequestField, unknown>> = {};
  for (const key of CHANGE_REQUEST_FIELDS) {
    if (!(key in proposed)) continue;
    const a = current[key] ?? null;
    const b = proposed[key] ?? null;
    const same = Array.isArray(a) || Array.isArray(b) ? JSON.stringify(a ?? []) === JSON.stringify(b ?? []) : a === b;
    if (!same) out[key] = b;
  }
  return out;
}

export const ChangeRequestSchema = PersonalStepSchema.pick({
  full_name_rumi: true,
  full_name_arabic: true,
  public_display_name: true,
  professional_title: true,
  gender: true,
  alternative_spellings: true,
})
  .merge(QualificationsStepSchema)
  .merge(
    z.object({
      teaching_state_id: z.string().uuid('Negeri mengajar diperlukan.'),
      teaching_district_id: optionalUuid,
      primary_institution_id: optionalUuid,
      teaching_experience_years: z.coerce.number().int().min(0).max(80),
      short_bio: requiredText(30, 500, 'Biografi ringkas'),
      full_biography: optionalText(5000),
      applicant_notes: optionalText(1000),
    }),
  );
export type ChangeRequestInput = z.input<typeof ChangeRequestSchema>;
