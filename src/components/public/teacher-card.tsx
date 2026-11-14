'use client';

import Link from 'next/link';
import { MapPin, School, ScrollText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { TeacherAvatar } from './teacher-avatar';
import { DemoBadge, VerificationBadges } from './verification-badges';
import { useI18n } from '@/lib/i18n/client';
import { fmt } from '@/lib/i18n/dictionaries';
import type { TeacherSearchResult } from '@/types/public';

export function TeacherCard({ teacher }: { teacher: TeacherSearchResult }) {
  const { t } = useI18n();
  const location = [teacher.district_name, teacher.state_name].filter(Boolean).join(', ');
  const specialization =
    teacher.primary_riwayat_rumi ?? teacher.primary_qiraat_rumi ?? teacher.specializations?.slice(0, 2).join(', ') ?? null;

  return (
    <Card className="flex h-full flex-col p-5 transition-shadow hover:shadow-md">
      <div className="flex gap-4">
        <TeacherAvatar name={teacher.public_display_name} photoUrl={teacher.photo_url} />
        <div className="min-w-0 space-y-1">
          {teacher.professional_title ? <p className="truncate text-xs font-medium text-muted-foreground">{teacher.professional_title}</p> : null}
          <h3 className="font-semibold leading-snug text-forest-900">{teacher.public_display_name}</h3>
          {teacher.full_name_arabic ? (
            <p lang="ar" className="arabic truncate text-sm text-forest-700">
              {teacher.full_name_arabic}
            </p>
          ) : null}
        </div>
      </div>

      <dl className="mt-4 space-y-1.5 text-sm text-muted-foreground">
        <div className="flex items-start gap-2">
          <dt className="sr-only">{t.card.location}</dt>
          <MapPin className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
          <dd>{location}</dd>
        </div>
        {teacher.institution_name ? (
          <div className="flex items-start gap-2">
            <dt className="sr-only">{t.card.institution}</dt>
            <School className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
            <dd className="line-clamp-1">{teacher.institution_name}</dd>
          </div>
        ) : null}
        <div className="flex items-start gap-2">
          <dt className="sr-only">{t.card.sanadLabel}</dt>
          <ScrollText className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
          <dd>
            {fmt(t.card.sanadCount, { n: teacher.approved_sanad_count })}
            {specialization ? <span className="block text-xs">{specialization}</span> : null}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-1 flex-col justify-end gap-3">
        <div className="flex flex-wrap gap-1.5">
          {teacher.is_demo_record ? <DemoBadge /> : null}
          <VerificationBadges size="compact" profileVerified documentsReviewed={teacher.documents_reviewed_badge} sanadReviewed={teacher.sanad_reviewed_badge} />
        </div>
        <Link
          href={`/directory/${teacher.id}`}
          className="text-sm font-semibold text-primary underline-offset-4 hover:underline"
          aria-label={fmt(t.card.viewProfileOf, { name: teacher.public_display_name })}
        >
          {t.card.viewProfile}
        </Link>
      </div>
    </Card>
  );
}
