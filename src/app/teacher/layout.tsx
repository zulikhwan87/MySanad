import { requireTeacherPortal } from '@/lib/auth/session';
import { PortalNav } from '@/components/teacher/portal-nav';
import { getUnreadCount } from '@/lib/data/notifications';

export const dynamic = 'force-dynamic';

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireTeacherPortal('/teacher/dashboard');
  const unread = await getUnreadCount().catch(() => 0);
  return (
    <div className="container grid gap-6 py-6 lg:grid-cols-[220px_1fr] lg:py-10">
      <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
        <div className="hidden px-3 lg:block">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Portal Guru</p>
          <p className="truncate text-sm font-semibold text-forest-900">{profile.full_name}</p>
        </div>
        <PortalNav unread={unread} />
      </aside>
      <div className="min-w-0 space-y-6">{children}</div>
    </div>
  );
}
