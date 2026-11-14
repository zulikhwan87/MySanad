import type { Metadata, Viewport } from 'next';
import { Amiri, Noto_Sans_Arabic, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { SiteHeader } from '@/components/layout/site-header';
import { AnnouncementBanner } from '@/components/layout/announcement-banner';
import { SiteFooter } from '@/components/layout/site-footer';
import { MotionProvider } from '@/components/motion/motion';
import { I18nProvider } from '@/lib/i18n/client';
import { textDirection } from '@/lib/i18n/config';
import { getLocale } from '@/lib/i18n/server';
import { getDictionary } from '@/lib/i18n/dictionaries';

const sans = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const arabic = Noto_Sans_Arabic({ subsets: ['arabic'], variable: '--font-arabic', display: 'swap' });
const amiri = Amiri({ subsets: ['arabic', 'latin'], weight: ['400', '700'], variable: '--font-amiri', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'MySanad — Direktori Sanad Guru al-Quran Malaysia', template: '%s · MySanad' },
  description:
    'Direktori dan platform dokumentasi sanad guru al-Quran Malaysia. Maklumat diserahkan oleh guru dan disemak oleh pentadbir; bukan pengisytiharan kesahihan sanad.',
};

export const viewport: Viewport = { themeColor: '#225339' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = getLocale();
  const t = getDictionary(locale);
  return (
    <html lang={locale} dir={textDirection(locale)} className={`${sans.variable} ${arabic.variable} ${amiri.variable}`}>
      <body className={`flex min-h-screen flex-col ${locale === 'ar' ? 'font-arabic' : 'font-sans'}`}>
        <I18nProvider locale={locale}>
          <a
            href="#kandungan"
            className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:px-4 focus:py-2"
          >
            {t.nav.skipToContent}
          </a>
          <AnnouncementBanner />
          <SiteHeader />
          <main id="kandungan" className="flex-1">
            <MotionProvider>{children}</MotionProvider>
          </main>
          <SiteFooter />
        </I18nProvider>
      </body>
    </html>
  );
}
