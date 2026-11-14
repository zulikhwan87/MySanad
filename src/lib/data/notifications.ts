import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';
import { getSessionProfile } from '@/lib/auth/session';

export interface NotificationItem {
  id: string;
  notification_type: string;
  title: string;
  message: string;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
}

export async function getMyNotifications(limit = 100): Promise<NotificationItem[] | null> {
  const profile = await getSessionProfile();
  if (!profile) return null;
  const { data, error } = await createServerSupabase()
    .from('notifications')
    .select('id, notification_type, title, message, action_url, is_read, created_at')
    .eq('recipient_profile_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`[notifications] ${error.message}`);
  return (data ?? []) as NotificationItem[];
}

export async function getUnreadCount(): Promise<number> {
  const profile = await getSessionProfile();
  if (!profile) return 0;
  const { count } = await createServerSupabase()
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_profile_id', profile.id)
    .eq('is_read', false);
  return count ?? 0;
}
