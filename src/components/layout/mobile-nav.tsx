'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface NavItem {
  href: string;
  label: string;
}

export function MobileNav({ items, menuLabel, children }: { items: NavItem[]; menuLabel: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="lg:hidden">
      <Button
        variant="ghost"
        size="icon"
        aria-label={menuLabel}
        aria-expanded={open}
        aria-controls="mobile-nav"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X aria-hidden /> : <Menu aria-hidden />}
      </Button>
      {open ? (
        <nav id="mobile-nav" className="absolute inset-x-0 top-16 z-40 border-b bg-card px-4 pb-4 shadow-soft">
          <ul className="flex flex-col py-2">
            {items.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="block rounded-lg px-3 py-2.5 text-sm font-medium hover:bg-secondary">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 border-t pt-3">{children}</div>
        </nav>
      ) : null}
    </div>
  );
}
