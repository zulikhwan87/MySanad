import { requireAdminPortal } from '@/lib/auth/session';
import { isSuperAdmin, ROLE_LABELS } from '@/lib/auth/roles';
import { AdminNav } from '@/components/admin/admin-nav';
import { getDashboardCounts } from '@/lib/data/admin';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireAdminPortal('/admin/dashboard');
  const counts = await getDashboardCounts().catch(() => null);
  const open = counts ? Object.values(counts.open_by_type).reduce((a, b) => a + b, 0) + counts.open_change_requests : 0;
  return (
    <div className="container grid gap-6 py-6 lg:grid-cols-[230px_1fr] lg:py-10">
      <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
        <div className="hidden px-3 lg:block">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{ROLE_LABELS[profile.role]}</p>
          <p className="truncate text-sm font-semibold text-forest-900">{profile.full_name}</p>
        </div>
        <AdminNav superAdmin={isSuperAdmin(profile)} openCount={open} />
      </aside>
      <div className="min-w-0 space-y-6">{children}</div>
    </div>
  );
}
