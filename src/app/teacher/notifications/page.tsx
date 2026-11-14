import type { Metadata } from 'next';
import { Card, CardContent } from '@/components/ui/card';
import { PortalHeader } from '@/components/teacher/portal-header';
import { NotificationList } from '@/components/teacher/notification-list';
import { NotConfigured } from '@/components/public/states';
import { getMyNotifications } from '@/lib/data/notifications';

export const metadata: Metadata = { title: 'Notifikasi' };

export default async function NotificationsPage() {
  const items = await getMyNotifications();
  if (!items) return <NotConfigured />;
  return (
    <>
      <PortalHeader title="Notifikasi" description="Makluman tentang keputusan semakan, penerbitan dan akaun anda." />
      <Card>
        <CardContent className="pt-6">
          <NotificationList items={items} />
        </CardContent>
      </Card>
    </>
  );
}
