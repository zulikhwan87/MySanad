'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Building2, ClipboardCheck, Database, GitBranch, Link2, LayoutDashboard, ScrollText, Settings, Users, UsersRound } from 'lucide-react';
import { cn } from '@/lib/utils';

const ITEMS = [
  { href: '/admin/dashboard', label: 'Papan Pemuka', icon: LayoutDashboard },
  { href: '/admin/verification', label: 'Barisan Semakan', icon: ClipboardCheck },
  { href: '/admin/teachers', label: 'Guru', icon: UsersRound },
  { href: '/admin/sanad', label: 'Sanad', icon: GitBranch },
  { href: '/admin/reference-chains', label: 'Rantaian Rujukan', icon: Link2 },
  { href: '/admin/institutions', label: 'Institusi', icon: Building2 },
  { href: '/admin/reference-data', label: 'Data Rujukan', icon: Database },
  { href: '/admin/analytics', label: 'Analitik', icon: BarChart3 },
  { href: '/admin/users', label: 'Pengguna & Peranan', icon: Users, superOnly: true },
  { href: '/admin/audit-logs', label: 'Log Audit', icon: ScrollText, superOnly: true },
  { href: '/admin/settings', label: 'Tetapan', icon: Settings },
];

export function AdminNav({ superAdmin, openCount }: { superAdmin: boolean; openCount: number }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Portal pentadbir" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
      <ul className="flex gap-1 lg:flex-col">
        {ITEMS.filter((i) => !i.superOnly || superAdmin).map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/admin/dashboard' && pathname.startsWith(href));
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
                {href === '/admin/verification' && openCount > 0 ? (
                  <span className={cn('ml-auto rounded-full px-1.5 text-xs', active ? 'bg-white/20' : 'bg-gold-100 text-gold-700')}>{openCount}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
