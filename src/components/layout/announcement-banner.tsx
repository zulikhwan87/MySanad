import { Megaphone } from 'lucide-react';
import { getPublicSettings } from '@/lib/data/settings';

/** Site-wide notice set by the Super Admin in Tetapan Sistem (plain text, max 300 chars). */
export async function AnnouncementBanner() {
  const { announcement } = await getPublicSettings();
  if (!announcement.trim()) return null;
  return (
    <div role="status" className="border-b border-gold-200 bg-gold-50 text-gold-700">
      <p className="container flex items-start gap-2 py-2 text-sm">
        <Megaphone className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{announcement}</span>
      </p>
    </div>
  );
}
