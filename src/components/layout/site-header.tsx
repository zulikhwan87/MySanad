import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from './logo';
import { MobileNav, type NavItem } from './mobile-nav';
import { getT } from '@/lib/i18n/server';
import { LanguageSwitcher } from './language-switcher';
import { getSessionProfile } from '@/lib/auth/session';
import { canAccessAdminPortal } from '@/lib/auth/roles';
import { signOutAction } from '@/lib/actions/auth-actions';

export async function SiteHeader() {
  const t = getT();
  const profile = await getSessionProfile();
  const isAdmin = canAccessAdminPortal(profile);

  const nav: NavItem[] = [
    { href: '/directory', label: t.nav.directory },
    { href: '/states', label: t.nav.states },
    { href: '/sanad', label: t.nav.sanad },
    { href: '/institutions', label: t.nav.institutions },
    { href: '/about', label: t.nav.about },
  ];

  const authArea = profile ? (
    <>
      <Button asChild variant="outline" size="sm">
        <Link href={isAdmin ? '/admin/dashboard' : '/teacher/dashboard'}>
          {isAdmin ? t.nav.adminPortal : t.nav.teacherPortal}
        </Link>
      </Button>
      <form action={signOutAction}>
        <Button type="submit" variant="ghost" size="sm" className="w-full">
          <LogOut aria-hidden />
          {t.nav.logout}
        </Button>
      </form>
    </>
  ) : (
    <>
      <Button asChild variant="ghost" size="sm">
        <Link href="/login">{t.nav.login}</Link>
      </Button>
      <Button asChild size="sm">
        <Link href="/register">{t.nav.register}</Link>
      </Button>
    </>
  );

  return (
    <header className="sticky top-0 z-30 border-b bg-card/90 backdrop-blur supports-[backdrop-filter]:bg-card/75">
      <div className="container relative flex h-16 items-center justify-between gap-4">
        <Logo tagline={t.brand.tagline} />
        <nav aria-label={t.nav.mainNav} className="hidden lg:block">
          <ul className="flex items-center gap-1">
            {nav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-forest-800 hover:bg-secondary"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <LanguageSwitcher />
          {authArea}
        </div>
        <MobileNav items={nav} menuLabel={t.nav.menu}>
          <LanguageSwitcher />
          {authArea}
        </MobileNav>
      </div>
    </header>
  );
}
