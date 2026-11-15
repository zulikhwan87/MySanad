import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Info, MapPin, School } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { FadeIn } from '@/components/motion/motion';
import { TeacherAvatar } from '@/components/public/teacher-avatar';
import { DemoBadge, VerificationBadges } from '@/components/public/verification-badges';
import { NotConfigured } from '@/components/public/states';
import { ProfileTabs } from '@/components/profile/profile-tabs';
import { getPublicSanadDocuments, getTeacherProfile } from '@/lib/data/public-directory';
import { UuidSchema } from '@/lib/validations/search';
import { getT } from '@/lib/i18n/server';

interface Props {
  params: { teacherId: string };
}

async function load(teacherId: string) {
  if (!UuidSchema.safeParse(teacherId).success) notFound();
  const profile = await getTeacherProfile(teacherId);
  if (profile === 'not-found') notFound();
  return profile;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!UuidSchema.safeParse(params.teacherId).success) return { title: 'Profil tidak ditemui' };
  const profile = await getTeacherProfile(params.teacherId);
  if (!profile || profile === 'not-found') return { title: 'Profil Guru' };
  return {
    title: profile.teacher.public_display_name,
    description: `Profil guru al-Quran di ${profile.teacher.state_name}. Maklumat disemak oleh pentadbir MySanad.`,
  };
}

export default async function TeacherProfilePage({ params }: Props) {
  const data = await load(params.teacherId);
  if (!data) {
    return (
      <div className="container py-12">
        <NotConfigured />
      </div>
    );
  }
  const { teacher } = data;
  const t = getT();
  const documents = await getPublicSanadDocuments(teacher.id);
  const location = [teacher.district_name, teacher.state_name].filter(Boolean).join(', ');

  return (
    <div className="container py-8">
      <Link href="/directory" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-forest-900">
        <ArrowLeft className="size-4 rtl:rotate-180" aria-hidden /> {t.profile.back}
      </Link>

      <FadeIn className="mt-4 rounded-3xl border bg-card p-6 shadow-soft sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row">
          <TeacherAvatar name={teacher.public_display_name} photoUrl={teacher.photo_url} size={112} />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {teacher.is_demo_record ? <DemoBadge /> : null}
              <VerificationBadges
                profileVerified={teacher.profile_verification_status === 'published'}
                documentsReviewed={teacher.documents_reviewed_badge}
                sanadReviewed={teacher.sanad_reviewed_badge}
              />
            </div>
            <div>
              {teacher.professional_title ? <p className="text-sm font-medium text-muted-foreground">{teacher.professional_title}</p> : null}
              <h1 className="text-2xl font-bold tracking-tight text-forest-900 sm:text-3xl">{teacher.public_display_name}</h1>
              {teacher.full_name_arabic ? (
                <p lang="ar" className="arabic mt-1 text-xl text-forest-700">
                  {teacher.full_name_arabic}
                </p>
              ) : null}
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <MapPin className="size-4 text-emerald-600" aria-hidden />
                <span>
                  {t.profile.teachesIn}{' '}
                  <Link href={`/states/${teacher.state_slug}`} className="hover:text-primary hover:underline">
                    {location}
                  </Link>
                </span>
              </li>
              {teacher.institution_name ? (
                <li className="flex items-center gap-1.5">
                  <School className="size-4 text-emerald-600" aria-hidden />
                  {teacher.institution_name}
                </li>
              ) : null}
              <li>
                <Badge variant="outline">{teacher.teacher_code}</Badge>
              </li>
              {data.settings.accepting_students ? (
                <li>
                  <Badge variant="secondary">{t.profile.accepting}</Badge>
                </li>
              ) : null}
            </ul>
          </div>
        </div>
      </FadeIn>

      <div className="mt-6">
        <ProfileTabs data={data} documents={documents} />
      </div>

      <aside className="mt-4 flex gap-3 rounded-xl border border-forest-200 bg-forest-50 p-4 text-sm text-forest-800">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <p>
          {t.profile.disclaimer}
        </p>
      </aside>
    </div>
  );
}
