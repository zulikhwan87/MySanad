import type { UserRole } from '@/types/mysanad';

export const ADMIN_ROLES: readonly UserRole[] = ['super_admin', 'verification_admin'];

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  verification_admin: 'Pentadbir Pengesahan',
  registered_teacher: 'Guru Berdaftar',
  public_visitor: 'Pelawat Awam',
};

export interface RoleSubject {
  role: UserRole;
  is_active: boolean;
}

export function isAdmin(subject: RoleSubject | null | undefined): boolean {
  return Boolean(subject?.is_active && ADMIN_ROLES.includes(subject.role));
}

export function isSuperAdmin(subject: RoleSubject | null | undefined): boolean {
  return Boolean(subject?.is_active && subject.role === 'super_admin');
}

/** Admin portal: Super Admin and Verification Admin. */
export const canAccessAdminPortal = isAdmin;

/** Review/approve/reject verification submissions. */
export const canReviewVerification = isAdmin;

/** Assign or revoke administrator roles: Super Admin only, never on themselves. */
export function canAssignRoles(actor: (RoleSubject & { id: string }) | null, targetId: string): boolean {
  return isSuperAdmin(actor) && actor!.id !== targetId;
}

/** Teacher portal: any active signed-in account (teachers manage only their own records via RLS). */
export function canAccessTeacherPortal(subject: RoleSubject | null | undefined): boolean {
  return Boolean(subject?.is_active);
}

/** Where to send a user right after signing in. */
export function defaultHomeFor(subject: RoleSubject | null | undefined): string {
  if (isAdmin(subject)) return '/admin/dashboard';
  return '/teacher/dashboard';
}
