import Link from 'next/link';
import { Logo } from './logo';
import { getT } from '@/lib/i18n/server';

export function SiteFooter() {
  const t = getT();
  return (
    <footer className="mt-16 border-t bg-card">
      <div className="container grid gap-8 py-10 md:grid-cols-[2fr_1fr]">
        <div className="space-y-3">
          <Logo tagline={t.brand.tagline} />
          <p className="max-w-xl text-sm text-muted-foreground">{t.footer.disclaimer}</p>
        </div>
        <nav aria-label={t.footer.links} className="text-sm">
          <ul className="grid grid-cols-2 gap-2">
            <li><Link className="hover:text-primary" href="/about">{t.nav.about}</Link></li>
            <li><Link className="hover:text-primary" href="/contact">{t.footer.contact}</Link></li>
            <li><Link className="hover:text-primary" href="/privacy">{t.footer.privacy}</Link></li>
            <li><Link className="hover:text-primary" href="/terms">{t.footer.terms}</Link></li>
          </ul>
        </nav>
      </div>
      <div className="border-t py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} MySanad. {t.footer.rights}
      </div>
    </footer>
  );
}
