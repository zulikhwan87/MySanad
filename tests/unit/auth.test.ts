import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from '@/lib/auth/redirect';
import {
  canAccessAdminPortal,
  canAccessTeacherPortal,
  canAssignRoles,
  canReviewVerification,
  defaultHomeFor,
  isSuperAdmin,
} from '@/lib/auth/roles';
import { ForgotPasswordSchema, LoginSchema, RegisterSchema, UpdatePasswordSchema } from '@/lib/validations/auth';

const teacher = { id: 't', role: 'registered_teacher' as const, is_active: true };
const verifier = { id: 'v', role: 'verification_admin' as const, is_active: true };
const superAdmin = { id: 's', role: 'super_admin' as const, is_active: true };
const suspendedAdmin = { id: 'x', role: 'super_admin' as const, is_active: false };

describe('role permissions', () => {
  it('only active admins reach the admin portal and review queue', () => {
    expect(canAccessAdminPortal(teacher)).toBe(false);
    expect(canAccessAdminPortal(verifier)).toBe(true);
    expect(canAccessAdminPortal(superAdmin)).toBe(true);
    expect(canAccessAdminPortal(suspendedAdmin)).toBe(false);
    expect(canAccessAdminPortal(null)).toBe(false);
    expect(canReviewVerification(verifier)).toBe(true);
    expect(canReviewVerification(teacher)).toBe(false);
  });

  it('only the super admin assigns roles, never to themselves', () => {
    expect(canAssignRoles(superAdmin, 't')).toBe(true);
    expect(canAssignRoles(superAdmin, 's')).toBe(false);
    expect(canAssignRoles(verifier, 't')).toBe(false);
    expect(canAssignRoles(suspendedAdmin, 't')).toBe(false);
    expect(canAssignRoles(null, 't')).toBe(false);
    expect(isSuperAdmin(verifier)).toBe(false);
  });

  it('teacher portal requires an active account', () => {
    expect(canAccessTeacherPortal(teacher)).toBe(true);
    expect(canAccessTeacherPortal({ ...teacher, is_active: false })).toBe(false);
    expect(canAccessTeacherPortal(undefined)).toBe(false);
  });

  it('sends users to the right home after login', () => {
    expect(defaultHomeFor(teacher)).toBe('/teacher/dashboard');
    expect(defaultHomeFor(verifier)).toBe('/admin/dashboard');
  });
});

describe('safeRedirectPath (open-redirect protection)', () => {
  it.each([
    ['/teacher/sanad?tab=1', '/teacher/sanad?tab=1'],
    ['/admin/dashboard#x', '/admin/dashboard#x'],
  ])('keeps same-origin path %s', (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });

  it.each(['//evil.com', '/\\evil.com', 'https://evil.com', 'javascript:alert(1)', 'evil.com', '', '/\n/evil.com', null, 42])(
    'rejects %s',
    (input) => {
      expect(safeRedirectPath(input, '/fallback')).toBe('/fallback');
    },
  );
});

describe('auth validation', () => {
  const valid = {
    full_name: 'Ahmad bin Ali',
    email: ' Ahmad@Contoh.Test ',
    password: 'kataLaluan123',
    confirm_password: 'kataLaluan123',
    accept_terms: true,
  };

  it('accepts a valid registration and normalises the email', () => {
    const r = RegisterSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe('ahmad@contoh.test');
  });

  it('rejects weak, mismatched or unaccepted registrations', () => {
    expect(RegisterSchema.safeParse({ ...valid, password: 'pendek1', confirm_password: 'pendek1' }).success).toBe(false);
    expect(RegisterSchema.safeParse({ ...valid, password: 'tiadanomborlangsung', confirm_password: 'tiadanomborlangsung' }).success).toBe(false);
    expect(RegisterSchema.safeParse({ ...valid, confirm_password: 'lain12345678' }).success).toBe(false);
    expect(RegisterSchema.safeParse({ ...valid, accept_terms: false }).success).toBe(false);
    expect(RegisterSchema.safeParse({ ...valid, email: 'bukan-emel' }).success).toBe(false);
  });

  it('ignores any role field a client tries to send', () => {
    const r = RegisterSchema.safeParse({ ...valid, role: 'super_admin' });
    expect(r.success && 'role' in r.data).toBe(false);
  });

  it('validates login, forgot and update password forms', () => {
    expect(LoginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
    expect(LoginSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
    expect(ForgotPasswordSchema.safeParse({ email: 'x' }).success).toBe(false);
    expect(UpdatePasswordSchema.safeParse({ password: 'baharu12345', confirm_password: 'baharu12345' }).success).toBe(true);
    expect(UpdatePasswordSchema.safeParse({ password: 'baharu12345', confirm_password: 'lain' }).success).toBe(false);
  });
});
