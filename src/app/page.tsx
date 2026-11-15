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
      <section className="pattern-forest text-white">
        <FadeIn className="container grid gap-8 py-14 md:py-20">
          <div className="max-w-3xl space-y-4">
            <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
              {t.home.heroTitle}
            </h1>
            <p lang="ar" className="arabic text-xl text-gold-200 sm:text-2xl">
              خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ
            </p>
            <p className="max-w-2xl text-base text-forest-100 sm:text-lg">
              {t.home.heroSubtitle}
            </p>
          </div>
          <div className="max-w-2xl rounded-2xl bg-white/10 p-3 backdrop-blur [&_input]:text-foreground">
            <SearchBox size="lg" />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="accent">
              <Link href="/register">{t.home.register}</Link>
            </Button>
            <Button asChild variant="outline" className="border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white">
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
