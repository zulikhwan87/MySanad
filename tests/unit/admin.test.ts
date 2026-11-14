import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';

const UID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

const state = vi.hoisted(() => ({
  profile: null as null | { id: string; role: string; is_active: boolean; full_name: string; email: string },
  rpc: vi.fn(),
  update: vi.fn(),
  rateOk: true,
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ consumeRateLimit: async () => state.rateOk }));
vi.mock('@/lib/auth/session', () => ({ getSessionProfile: async () => state.profile }));
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabase: () => ({
    rpc: state.rpc,
    from: () => {
      const q = {
        update: (v: unknown) => {
          state.update(v);
          return q;
        },
        eq: () => q,
        select: () => q,
        maybeSingle: async () => ({ data: { id: OTHER }, error: null }),
      };
      return q;
    },
  }),
}));

import {
  decideSubmissionAction,
  revealIcAction,
  setUserActiveAction,
  setUserRoleAction,
  startReviewAction,
} from '@/lib/actions/admin-actions';
import { encryptPii } from '@/lib/crypto/pii';
import { ChangeRequestDecisionSchema, DecisionSchema, PublicationSchema } from '@/lib/validations/admin';

const verifier = { id: UID, role: 'verification_admin', is_active: true, full_name: 'Pengesah', email: 'p@x' };
const superAdmin = { ...verifier, role: 'super_admin' };
const teacher = { ...verifier, role: 'registered_teacher' };

beforeEach(() => {
  state.profile = verifier;
  state.rateOk = true;
  state.rpc.mockReset().mockResolvedValue({ data: null, error: null });
  state.update.mockReset();
});

describe('admin schemas', () => {
  it('requires feedback to reject or request revision', () => {
    const base = { submission_id: UID };
    expect(DecisionSchema.safeParse({ ...base, decision: 'publish' }).success).toBe(true);
    expect(DecisionSchema.safeParse({ ...base, decision: 'reject' }).success).toBe(false);
    expect(DecisionSchema.safeParse({ ...base, decision: 'revision_required', public_feedback: '  ' }).success).toBe(false);
    expect(DecisionSchema.safeParse({ ...base, decision: 'reject', public_feedback: 'Tidak lengkap' }).success).toBe(true);
    expect(DecisionSchema.safeParse({ ...base, decision: 'certify' }).success).toBe(false);
  });

  it('requires a reason to suspend or unpublish and feedback to reject a change', () => {
    expect(PublicationSchema.safeParse({ teacher_id: UID, action: 'suspend' }).success).toBe(false);
    expect(PublicationSchema.safeParse({ teacher_id: UID, action: 'publish' }).success).toBe(true);
    expect(ChangeRequestDecisionSchema.safeParse({ request_id: UID, approve: false }).success).toBe(false);
  });
});

describe('admin actions', () => {
  it('refuse non-administrators before touching the database', async () => {
    state.profile = teacher;
    expect((await startReviewAction(UID)).ok).toBe(false);
    expect((await decideSubmissionAction({ submission_id: UID, decision: 'publish' })).ok).toBe(false);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('pass decisions to the atomic database function', async () => {
    const res = await decideSubmissionAction({ submission_id: UID, decision: 'reject', public_feedback: 'Imbasan kabur', internal_comment: 'nota' });
    expect(res.ok).toBe(true);
    expect(state.rpc).toHaveBeenCalledWith('admin_decide_submission', {
      p_submission_id: UID,
      p_decision: 'reject',
      p_public_feedback: 'Imbasan kabur',
      p_internal_comment: 'nota',
      p_checklist: {},
    });
  });

  it('surface database refusals as messages', async () => {
    state.rpc.mockResolvedValue({ data: null, error: { code: '22023', message: 'Permohonan ini telah diputuskan.' } });
    expect(await startReviewAction(UID)).toEqual({ ok: false, message: 'Permohonan ini telah diputuskan.' });
  });

  it('reserve role and account changes for the Super Admin, never on themselves', async () => {
    expect((await setUserRoleAction({ user_id: OTHER, role: 'verification_admin' })).message).toMatch(/Super Admin/);
    state.profile = superAdmin;
    expect((await setUserRoleAction({ user_id: UID, role: 'registered_teacher' })).ok).toBe(false);
    expect((await setUserActiveAction({ user_id: UID, active: false })).ok).toBe(false);
    expect((await setUserRoleAction({ user_id: OTHER, role: 'verification_admin' })).ok).toBe(true);
    expect(state.update).toHaveBeenCalledWith({ role: 'verification_admin' });
    expect((await setUserRoleAction({ user_id: OTHER, role: 'public_visitor' })).ok).toBe(false);
  });

  it('reveal a MyKad only with a reason, decrypting server-side', async () => {
    process.env.MYSANAD_PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    state.rpc.mockResolvedValue({ data: encryptPii('880101031234'), error: null });
    expect((await revealIcAction({ teacher_id: OTHER, reason: 'x' })).ok).toBe(false);
    const res = await revealIcAction({ teacher_id: OTHER, reason: 'Pengesahan identiti' });
    expect(res).toEqual({ ok: true, value: '880101-03-1234' });
    expect(state.rpc).toHaveBeenCalledWith('admin_get_teacher_ic_ciphertext', { p_teacher_id: OTHER, p_reason: 'Pengesahan identiti' });
    state.rateOk = false;
    expect((await revealIcAction({ teacher_id: OTHER, reason: 'Pengesahan identiti' })).ok).toBe(false);
  });
});
