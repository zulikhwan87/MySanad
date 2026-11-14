'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { deleteNotificationAction, markAllNotificationsReadAction, markNotificationReadAction } from '@/lib/actions/notification-actions';
import type { NotificationItem } from '@/lib/data/notifications';
import { cn } from '@/lib/utils';

export function NotificationList({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<unknown>) =>
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  const unread = items.filter((n) => !n.is_read).length;

  if (items.length === 0) return <p className="text-sm text-muted-foreground">Tiada notifikasi.</p>;
  return (
    <div className="space-y-3">
      {unread ? (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" disabled={pending} onClick={() => run(markAllNotificationsReadAction)}>
            <CheckCheck aria-hidden /> Tanda semua dibaca ({unread})
          </Button>
        </div>
      ) : null}
      <ul className="space-y-2">
        {items.map((n) => (
          <li key={n.id} className={cn('flex items-start justify-between gap-3 rounded-xl border p-4', !n.is_read && 'border-primary/40 bg-secondary/50')}>
            <div className="min-w-0 space-y-1">
              <p className="font-medium text-forest-900">
                {!n.is_read ? <span className="mr-2 inline-block size-2 rounded-full bg-emerald-600" aria-label="Belum dibaca" /> : null}
                {n.title}
              </p>
              <p className="whitespace-pre-line text-sm">{n.message}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(n.created_at).toLocaleString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                {n.action_url?.startsWith('/') ? (
                  <>
                    {' · '}
                    <Link href={n.action_url} className="text-primary hover:underline" onClick={() => !n.is_read && run(() => markNotificationReadAction(n.id))}>
                      Lihat
                    </Link>
                  </>
                ) : null}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              {!n.is_read ? (
                <Button size="icon" variant="ghost" aria-label={`Tanda dibaca: ${n.title}`} disabled={pending} onClick={() => run(() => markNotificationReadAction(n.id))}>
                  <CheckCheck aria-hidden />
                </Button>
              ) : null}
              <Button size="icon" variant="ghost" aria-label={`Padam: ${n.title}`} disabled={pending} onClick={() => run(() => deleteNotificationAction(n.id))}>
                <Trash2 aria-hidden />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
