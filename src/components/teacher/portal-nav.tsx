'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  BookOpen,
  Building2,
  ClipboardCheck,
  FileText,
  GitBranch,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  Settings,
  UserRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/teacher/dashboard', label: 'Papan Pemuka', icon: LayoutDashboard },
  { href: '/teacher/register', label: 'Pendaftaran', icon: ListChecks },
  { href: '/teacher/profile', label: 'Profil', icon: UserRound },
  { href: '/teacher/education', label: 'Pendidikan', icon: GraduationCap },
  { href: '/teacher/ijazah', label: 'Ijazah', icon: BookOpen },
  { href: '/teacher/institutions', label: 'Institusi', icon: Building2 },
  { href: '/teacher/sanad', label: 'Sanad', icon: GitBranch },
  { href: '/teacher/documents', label: 'Dokumen', icon: FileText },
  { href: '/teacher/verification', label: 'Status Pengesahan', icon: ClipboardCheck },
  { href: '/teacher/notifications', label: 'Notifikasi', icon: Bell },
  { href: '/teacher/settings', label: 'Tetapan', icon: Settings },
];

export function PortalNav({ unread = 0 }: { unread?: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Portal guru" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
      <ul className="flex gap-1 lg:flex-col">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/teacher/dashboard' && pathname.startsWith(href));
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-forest-800 hover:bg-secondary',
                  active && 'bg-primary text-primary-foreground hover:bg-primary/90',
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {label}
                {href === '/teacher/notifications' && unread > 0 ? (
                  <span className={cn('ml-auto rounded-full px-1.5 text-xs', active ? 'bg-white/20' : 'bg-emerald-100 text-emerald-700')} aria-label={`${unread} belum dibaca`}>
                    {unread}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
