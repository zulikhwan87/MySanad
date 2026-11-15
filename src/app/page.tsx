import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FadeIn, StaggerItem, StaggerList } from '@/components/motion/motion';
import { SearchBox } from '@/components/public/search-box';
import { StatsRow } from '@/components/public/stats-row';
import { TeacherGrid } from '@/components/public/teacher-grid';
import { DemoBadge } from '@/components/public/verification-badges';
import { NotConfigured } from '@/components/public/states';
import { getFeaturedTeachers, getPlatformStats, getRecentTeachers } from '@/lib/data/public-directory';
import { getLocale } from '@/lib/i18n/server';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { intlLocale } from '@/lib/i18n/config';

function formatDate(iso: string | null, intl: string) {
  return iso ? new Date(iso).toLocaleDateString(intl, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
}

/** Words such as "al-Quran" never break at the hyphen. */
function KeepHyphenated({ text }: { text: string }) {
  return text.split(' ').map((word, i) => (
    <span key={i}>
      {i > 0 ? ' ' : null}
      {word.includes('-') ? <span className="whitespace-nowrap">{word}</span> : word}
    </span>
  ));
}

export default async function HomePage() {
  const [stats, featured, recent] = await Promise.all([
    getPlatformStats(),
    getFeaturedTeachers(6),
    getRecentTeachers(6),
  ]);
  const locale = getLocale();
  const t = getDictionary(locale);
  const intl = intlLocale(locale);

  return (
    <>
      <section className="pattern-forest relative isolate overflow-hidden text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-[-12rem] h-[32rem] w-[56rem] -translate-x-1/2 rounded-full bg-gold-400/10 blur-3xl" />
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-black/20" />
        </div>
        <FadeIn className="container flex flex-col items-center py-20 text-center md:py-28">
          <div className="flex items-center gap-4 text-gold-200">
            <span aria-hidden className="hidden h-px w-12 bg-gradient-to-r from-transparent to-gold-300/70 sm:block" />
            <p lang="ar" dir="rtl" className="arabic text-xl sm:text-2xl">
              خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ
            </p>
            <span aria-hidden className="hidden h-px w-12 bg-gradient-to-l from-transparent to-gold-300/70 sm:block" />
          </div>
          <h1 className="mt-6 max-w-4xl text-balance text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
            <KeepHyphenated text={t.home.heroTitle} />
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-base leading-relaxed text-forest-100/90 sm:text-lg">
            {t.home.heroSubtitle}
          </p>
          <div className="mt-10 w-full max-w-2xl rounded-2xl bg-white p-2 text-left shadow-2xl shadow-black/30 ring-1 ring-white/20 [&_input]:border-0 [&_input]:text-foreground [&_input]:shadow-none">
            <SearchBox size="lg" />
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild variant="accent" size="lg">
              <Link href="/register">{t.home.register}</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-white/30 bg-white/5 text-white hover:bg-white/10 hover:text-white">
              <Link href="/directory">{t.home.viewDirectory}</Link>
            </Button>
          </div>
        </FadeIn>
      </section>

      <div className="container space-y-14 py-12">
        <section aria-labelledby="statistik">
          <h2 id="statistik" className="sr-only">
            {t.home.statsLabel}
          </h2>
          {stats ? <StatsRow stats={stats} /> : <NotConfigured />}
        </section>

        {featured && featured.length > 0 ? (
          <section aria-labelledby="pilihan" className="space-y-4">
            <h2 id="pilihan" className="text-xl font-semibold text-forest-900">
              {t.home.featured}
            </h2>
            <TeacherGrid teachers={featured} />
          </section>
        ) : null}

        {recent && recent.length > 0 ? (
          <section aria-labelledby="terkini" className="space-y-4">
            <h2 id="terkini" className="text-xl font-semibold text-forest-900">
              {t.home.recent}
            </h2>
            <StaggerList className="divide-y rounded-2xl border bg-card shadow-soft">
              {recent.map((r) => (
                <StaggerItem key={r.id}>
                  <Link href={`/directory/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-secondary/60">
                    <span className="min-w-0">
                      <span className="block font-medium text-forest-900">{r.public_display_name}</span>
                      <span className="text-sm text-muted-foreground">
                        {[r.district_name, r.state_name].filter(Boolean).join(', ')}
                      </span>
                    </span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {r.is_demo_record ? <DemoBadge /> : null}
                      {formatDate(r.published_at, intl)}
                    </span>
                  </Link>
                </StaggerItem>
              ))}
            </StaggerList>
          </section>
        ) : null}

        <section aria-labelledby="sertai" className="rounded-2xl border bg-secondary/50 px-6 py-10 text-center">
          <h2 id="sertai" className="text-2xl font-semibold text-forest-900">
            {t.home.joinTitle}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-muted-foreground">{t.home.joinBody}</p>
          <Button asChild variant="accent" className="mt-6">
            <Link href="/register">{t.home.register}</Link>
          </Button>
        </section>
      </div>
    </>
  );
}
