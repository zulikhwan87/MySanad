'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Award, Building2, ExternalLink, GraduationCap, Mail, Network } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/public/states';
import { SanadChainCard } from './sanad-chain-card';
import { cn } from '@/lib/utils';
import type { PublicTeacherProfileData } from '@/types/public';
import type { PublicGraph } from '@/lib/data/sanad';
import { SanadGraphLazy } from '@/components/sanad/sanad-graph-lazy';
import { useI18n } from '@/lib/i18n/client';
import { fmt } from '@/lib/i18n/dictionaries';

const TABS = [
  { id: 'profil', key: 'tabProfile' },
  { id: 'kelayakan', key: 'tabQualifications' },
  { id: 'sanad', key: 'tabSanad' },
  { id: 'graf', key: 'tabGraph' },
  { id: 'institusi', key: 'tabInstitution' },
] as const;
type TabId = (typeof TABS)[number]['id'];

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Award; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-2 font-semibold text-forest-900">
        <Icon className="size-4 text-emerald-600" aria-hidden />
        {title}
      </h3>
      {children}
    </section>
  );
}

function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

function contactHref(type: string, value: string): string | null {
  if (type === 'Emel Rasmi' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${value}`;
  if (type === 'Telefon Pejabat / Institusi') return `tel:${value.replace(/[^\d+]/g, '')}`;
  return safeHttpUrl(value.startsWith('http') ? value : `https://${value}`);
}

export function ProfileTabs({ data, graph = null }: { data: PublicTeacherProfileData; graph?: PublicGraph | null }) {
  const { t, dir } = useI18n();
  const [tab, setTab] = useState<TabId>('profil');
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const { teacher } = data;

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    let next = index;
    // Arrow keys follow visual order, which is mirrored in right-to-left layouts.
    const forward = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    const backward = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
    if (e.key === forward) next = (index + 1) % TABS.length;
    else if (e.key === backward) next = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    else return;
    e.preventDefault();
    setTab(TABS[next].id);
    refs.current[next]?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label={t.profile.tabsLabel} className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((tabDef, i) => {
          const selected = tabDef.id === tab;
          const count =
            tabDef.id === 'sanad' ? data.sanad_chains.length : tabDef.id === 'kelayakan' ? data.education.length + data.ijazah.length : null;
          return (
            <button
              key={tabDef.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              role="tab"
              id={`tab-${tabDef.id}`}
              aria-selected={selected}
              aria-controls={`panel-${tabDef.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setTab(tabDef.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                'relative whitespace-nowrap px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-forest-900',
                selected && 'text-forest-900',
              )}
            >
              {t.profile[tabDef.key]}
              {count ? <span className="ms-1.5 rounded-full bg-secondary px-1.5 text-xs">{count}</span> : null}
              {selected ? <motion.span layoutId="tab-underline" className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-primary" /> : null}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          role="tabpanel"
          id={`panel-${tab}`}
          aria-labelledby={`tab-${tab}`}
          tabIndex={0}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3 }}
          className="space-y-8 py-6 focus-visible:outline-none"
        >
          {tab === 'profil' ? (
            <>
              <Section title={t.profile.bio} icon={Award}>
                {teacher.full_biography || teacher.short_bio ? (
                  <p className="whitespace-pre-line leading-relaxed text-forest-900/90">{teacher.full_biography ?? teacher.short_bio}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">{t.profile.noBio}</p>
                )}
              </Section>
              <dl className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border p-4">
                  <dt className="text-xs text-muted-foreground">{t.profile.experience}</dt>
                  <dd className="text-lg font-semibold text-forest-900">
                    {teacher.teaching_experience_years ? fmt(t.profile.years, { n: teacher.teaching_experience_years }) : '—'}
                  </dd>
                </div>
                <div className="rounded-xl border p-4">
                  <dt className="text-xs text-muted-foreground">{t.profile.primaryQiraat}</dt>
                  <dd className="font-semibold text-forest-900">{teacher.primary_qiraat_rumi ?? '—'}</dd>
                </div>
                <div className="rounded-xl border p-4">
                  <dt className="text-xs text-muted-foreground">{t.profile.primaryRiwayat}</dt>
                  <dd className="font-semibold text-forest-900">{teacher.primary_riwayat_rumi ?? '—'}</dd>
                </div>
              </dl>
              {teacher.specializations?.length ? (
                <Section title={t.profile.specializations} icon={Award}>
                  <ul className="flex flex-wrap gap-2">
                    {teacher.specializations.map((s) => (
                      <li key={s}>
                        <Badge variant="secondary">{s}</Badge>
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}
              {data.contacts.length ? (
                <Section title={t.profile.contacts} icon={Mail}>
                  <ul className="space-y-2 text-sm">
                    {data.contacts.map((c) => {
                      const href = contactHref(c.channel_type, c.contact_value);
                      return (
                        <li key={c.id}>
                          <span className="text-muted-foreground">{c.label}: </span>
                          {href ? (
                            <a href={href} rel="nofollow noopener noreferrer" target={href.startsWith('http') ? '_blank' : undefined} className="font-medium text-primary hover:underline">
                              {c.contact_value}
                            </a>
                          ) : (
                            <span className="font-medium">{c.contact_value}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </Section>
              ) : null}
            </>
          ) : null}

          {tab === 'kelayakan' ? (
            data.education.length === 0 && data.ijazah.length === 0 ? (
              <EmptyState title={t.profile.noQualifications}>{t.profile.noQualificationsBody}</EmptyState>
            ) : (
              <>
                {data.ijazah.length ? (
                  <Section title={t.profile.ijazah} icon={Award}>
                    <ul className="space-y-3">
                      {data.ijazah.map((ij) => (
                        <li key={ij.id} className="rounded-xl border p-4">
                          <p className="font-semibold text-forest-900">{ij.ijazah_title}</p>
                          <p className="text-sm text-muted-foreground">
                            {fmt(t.profile.from, { name: ij.granting_sheikh_rumi })}
                            {ij.granting_institution ? `, ${ij.granting_institution}` : ''}
                          </p>
                          {ij.granting_sheikh_arabic ? (
                            <p lang="ar" className="arabic text-sm text-forest-700">
                              {ij.granting_sheikh_arabic}
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs text-muted-foreground">
                            {[ij.qiraat, ij.riwayat, ij.tariq, ij.conferral_place, ij.conferral_date?.slice(0, 4)].filter(Boolean).join(' · ')}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </Section>
                ) : null}
                {data.education.length ? (
                  <Section title={t.profile.education} icon={GraduationCap}>
                    <ul className="space-y-3">
                      {data.education.map((e) => (
                        <li key={e.id} className="rounded-xl border p-4">
                          <p className="font-semibold text-forest-900">
                            {e.qualification_level} · {e.field_of_study}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {e.institution_name}, {e.country}
                            {e.graduation_year ? ` (${e.graduation_year})` : ''}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </Section>
                ) : null}
              </>
            )
          ) : null}

          {tab === 'sanad' ? (
            data.sanad_chains.length === 0 ? (
              <EmptyState title={t.profile.noSanad}>{t.profile.noSanadBody}</EmptyState>
            ) : (
              <ul className="space-y-3">
                {data.sanad_chains.map((c, i) => (
                  <motion.li key={c.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, duration: 0.35 }}>
                    <SanadChainCard chain={c} />
                  </motion.li>
                ))}
              </ul>
            )
          ) : null}

          {tab === 'graf' ? (
            !data.settings.show_sanad_graph ? (
              <EmptyState title={t.profile.graphHidden}>{t.profile.graphHiddenBody}</EmptyState>
            ) : graph && graph.edges.length ? (
              <SanadGraphLazy
                data={graph}
                mode="public"
                title={`Sanad ${data.teacher.public_display_name}`}
                allowExport={graph.chains.length > 0 && graph.chains.every((c) => c.allow_export)}
                height={520}
              />
            ) : (
              <EmptyState title={t.profile.noGraph}>{t.profile.noGraphBody}</EmptyState>
            )
          ) : null}

          {tab === 'institusi' ? (
            data.institution ? (
              <Section title={t.profile.institutionTitle} icon={Building2}>
                <div className="rounded-xl border p-5">
                  <p className="text-lg font-semibold text-forest-900">{data.institution.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {data.institution.category}
                    {data.institution.district_name || data.institution.state_name
                      ? ` · ${[data.institution.district_name, data.institution.state_name].filter(Boolean).join(', ')}`
                      : ''}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                    {data.institution.is_verified ? <Badge variant="secondary">{t.profile.verifiedInstitution}</Badge> : null}
                    {safeHttpUrl(data.institution.website_url) ? (
                      <a href={safeHttpUrl(data.institution.website_url)!} target="_blank" rel="nofollow noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                        {t.profile.website} <ExternalLink className="size-3.5" aria-hidden />
                      </a>
                    ) : null}
                    <Link href={`/directory?institusi=${data.institution.id}`} className="inline-flex items-center gap-1 text-primary hover:underline">
                      <Network className="size-3.5" aria-hidden /> {t.profile.otherTeachers}
                    </Link>
                  </div>
                </div>
              </Section>
            ) : (
              <EmptyState title={t.profile.noInstitution}>{t.profile.noInstitutionBody}</EmptyState>
            )
          ) : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
