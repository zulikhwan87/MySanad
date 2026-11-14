import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { NotConfigured } from '@/components/public/states';
import { DemoBadge } from '@/components/public/verification-badges';
import { SanadGraphLazy } from '@/components/sanad/sanad-graph-lazy';
import { FadeIn } from '@/components/motion/motion';
import { getPublicSanadGraph } from '@/lib/data/sanad';
import { UuidSchema } from '@/lib/validations/search';
import { getLocale } from '@/lib/i18n/server';
import { getDictionary } from '@/lib/i18n/dictionaries';
import { intlLocale } from '@/lib/i18n/config';

interface Props {
  params: { sanadId: string };
}

async function load(id: string) {
  if (!UuidSchema.safeParse(id).success) notFound();
  const graph = await getPublicSanadGraph({ chainId: id });
  if (graph && graph.chains.length === 0) notFound();
  return graph;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!UuidSchema.safeParse(params.sanadId).success) return { title: 'Sanad tidak ditemui' };
  const graph = await getPublicSanadGraph({ chainId: params.sanadId });
  const chain = graph?.chains[0];
  return chain ? { title: chain.title, description: `${chain.riwayat} · ${chain.teacher_name}` } : { title: 'Butiran Sanad' };
}

const formatDate = (d: string | null | undefined, intl: string) =>
  d ? new Date(d).toLocaleDateString(intl, { day: 'numeric', month: 'long', year: 'numeric' }) : null;

export default async function SanadDetailPage({ params }: Props) {
  const graph = await load(params.sanadId);
  if (!graph) {
    return (
      <div className="container py-12">
        <NotConfigured />
      </div>
    );
  }
  const c = graph.chains[0];
  const locale = getLocale();
  const t = getDictionary(locale);
  const intl = intlLocale(locale);
  const facts: Array<[string, React.ReactNode]> = [
    [t.sanadCard.code, <span key="c" className="font-mono">{c.sanad_code}</span>],
    [t.sanadCard.qiraat, c.qiraat],
    [t.sanadCard.riwayat, c.riwayat],
    [t.sanadCard.tariq, c.tariq],
    [t.sanadCard.method, c.transmission_method],
    [t.sanadCard.date, formatDate(c.ijazah_date, intl)],
    [t.sanadCard.place, c.ijazah_location],
    [t.sanadCard.depth, c.generation_depth],
    [t.sanadCard.reviewedAt, formatDate(c.verified_at, intl)],
  ];

  return (
    <div className="container space-y-6 py-8">
      <Link href="/sanad" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-forest-900">
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> {t.sanadPages.eyebrow}
      </Link>
      <FadeIn className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="gold">{t.sanadPages.reviewedBadge}</Badge>
          {c.is_demo_record ? <DemoBadge /> : null}
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-forest-900 sm:text-3xl">{c.title}</h1>
        {c.riwayat_arabic ? (
          <p lang="ar" className="arabic text-xl text-forest-700">
            {c.riwayat_arabic}
          </p>
        ) : null}
        <p className="text-muted-foreground">
          {t.sanadPages.documentedBy}{' '}
          <Link href={`/directory/${c.teacher_id}`} className="font-medium text-primary hover:underline">
            {c.teacher_name}
          </Link>
        </p>
      </FadeIn>

      <Card>
        <CardContent className="pt-6">
          <dl className="grid gap-4 sm:grid-cols-3">
            {facts
              .filter(([, v]) => v !== null && v !== undefined && v !== '')
              .map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs uppercase tracking-wide text-muted-foreground">{k}</dt>
                  <dd className="text-forest-900">{v}</dd>
                </div>
              ))}
          </dl>
          {c.public_notes ? <p className="mt-4 whitespace-pre-line border-t pt-4 text-sm">{c.public_notes}</p> : null}
        </CardContent>
      </Card>

      {graph.edges.length ? (
        <SanadGraphLazy data={graph} mode="public" title={c.title} allowExport={Boolean(c.allow_export)} />
      ) : (
        <p className="text-sm text-muted-foreground">{t.sanadPages.pending}</p>
      )}

      <aside className="flex gap-3 rounded-xl border border-forest-200 bg-forest-50 p-4 text-sm text-forest-800">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          {t.sanadCard.disclaimer}
        </p>
      </aside>
    </div>
  );
}
