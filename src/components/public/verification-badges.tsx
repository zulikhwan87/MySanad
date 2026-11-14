'use client';

import { BadgeCheck, FileCheck2, FlaskConical, GitBranch } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/client';

/**
 * Accurate labels only: each badge states WHAT an administrator reviewed.
 * None of them claims a sanad is authentic.
 */
export function VerificationBadges({
  profileVerified,
  documentsReviewed,
  sanadReviewed,
  size = 'default',
}: {
  profileVerified: boolean;
  documentsReviewed: boolean;
  sanadReviewed: boolean;
  size?: 'default' | 'compact';
}) {
  const { t } = useI18n();
  const compact = size === 'compact';
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={t.badges.label}>
      {profileVerified ? (
        <li>
          <Badge variant="secondary" title={t.badges.profileTitle}>
            <BadgeCheck className="size-3.5" aria-hidden />
            {t.badges.profile}
          </Badge>
        </li>
      ) : null}
      {documentsReviewed ? (
        <li>
          <Badge variant="secondary" title={t.badges.documentsTitle}>
            <FileCheck2 className="size-3.5" aria-hidden />
            {compact ? t.badges.documentsShort : t.badges.documents}
          </Badge>
        </li>
      ) : null}
      {sanadReviewed ? (
        <li>
          <Badge variant="gold" title={t.badges.sanadTitle}>
            <GitBranch className="size-3.5" aria-hidden />
            {compact ? t.badges.sanadShort : t.badges.sanad}
          </Badge>
        </li>
      ) : null}
    </ul>
  );
}

export function DemoBadge() {
  const { t } = useI18n();
  return (
    <Badge variant="warning" title={t.common.demoTitle}>
      <FlaskConical className="size-3.5" aria-hidden />
      {t.common.demoBadge}
    </Badge>
  );
}
