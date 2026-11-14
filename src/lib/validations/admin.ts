import { z } from 'zod';

export const DECISIONS = ['approve', 'publish', 'revision_required', 'reject'] as const;
export type Decision = (typeof DECISIONS)[number];

export const DECISION_LABELS: Record<Decision, string> = {
  approve: 'Luluskan',
  publish: 'Luluskan & terbitkan',
  revision_required: 'Minta pembetulan',
  reject: 'Tolak',
};

const text = (max: number) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : typeof v === 'string' ? v.trim() : v), z.string().max(max).optional());

export const DecisionSchema = z
  .object({
    submission_id: z.string().uuid(),
    decision: z.enum(DECISIONS, { errorMap: () => ({ message: 'Pilih keputusan.' }) }),
    public_feedback: text(2000),
    internal_comment: text(4000),
    checklist: z.record(z.string().max(60), z.boolean()).default({}),
  })
  .refine((v) => v.decision === 'approve' || v.decision === 'publish' || Boolean(v.public_feedback), {
    path: ['public_feedback'],
    message: 'Ulasan kepada guru diperlukan untuk menolak atau meminta pembetulan.',
  });

export const ChangeRequestDecisionSchema = z
  .object({ request_id: z.string().uuid(), approve: z.boolean(), feedback: text(2000) })
  .refine((v) => v.approve || Boolean(v.feedback), { path: ['feedback'], message: 'Ulasan diperlukan untuk menolak.' });

export const PUBLICATION_ACTIONS = ['publish', 'unpublish', 'suspend', 'reinstate'] as const;
export const PublicationSchema = z
  .object({ teacher_id: z.string().uuid(), action: z.enum(PUBLICATION_ACTIONS), reason: text(1000) })
  .refine((v) => !['unpublish', 'suspend'].includes(v.action) || Boolean(v.reason), {
    path: ['reason'],
    message: 'Nyatakan sebab.',
  });

export const ITEM_TABLES = ['teacher_education', 'ijazah_records', 'sanad_nodes', 'sanad_edges', 'public_contact_channels'] as const;
export const ItemStatusSchema = z.object({
  table: z.enum(ITEM_TABLES),
  id: z.string().uuid(),
  status: z.enum(['approved', 'revision_required', 'rejected', 'suspended']),
});

export const RevealIcSchema = z.object({
  teacher_id: z.string().uuid(),
  reason: z.string().trim().min(5, 'Nyatakan sebab akses (sekurang-kurangnya 5 aksara).').max(300),
});

export const ASSIGNABLE_ROLES = ['registered_teacher', 'verification_admin', 'super_admin'] as const;
export const UserRoleSchema = z.object({ user_id: z.string().uuid(), role: z.enum(ASSIGNABLE_ROLES) });
export const UserActiveSchema = z.object({ user_id: z.string().uuid(), active: z.boolean() });
export const InstitutionUpdateSchema = z.object({
  id: z.string().uuid(),
  is_verified: z.boolean().optional(),
  is_archived: z.boolean().optional(),
});

/** Review checklist shown to reviewers; stored as {key: boolean} in verification_reviews. */
export const CHECKLISTS: Record<string, Array<{ key: string; label: string }>> = {
  teacher_profile: [
    { key: 'identiti', label: 'Identiti disahkan (MyKad / dokumen pengenalan)' },
    { key: 'nama', label: 'Nama Rumi dan Arab konsisten' },
    { key: 'lokasi', label: 'Lokasi mengajar munasabah' },
    { key: 'biografi', label: 'Biografi sesuai untuk paparan awam' },
  ],
  ijazah_document: [
    { key: 'boleh_dibaca', label: 'Dokumen jelas dan boleh dibaca' },
    { key: 'nama_sepadan', label: 'Nama dalam dokumen sepadan dengan profil' },
    { key: 'pemberi', label: 'Pemberi ijazah / institusi dikenal pasti' },
  ],
  sanad_chain: [
    { key: 'syeikh_langsung', label: 'Syeikh langsung sepadan dengan ijazah' },
    { key: 'perawi', label: 'Nama perawi dan tahun wafat disemak dengan rujukan' },
    { key: 'kesinambungan', label: 'Kesinambungan jalur didokumenkan' },
    { key: 'dokumen', label: 'Dokumen sokongan disemak' },
  ],
};
