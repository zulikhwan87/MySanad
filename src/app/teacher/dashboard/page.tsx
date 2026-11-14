import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, Circle, ExternalLink, MessageSquareWarning } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PortalHeader } from '@/components/teacher/portal-header';
import { StatusBadge } from '@/components/teacher/status-badge';
import { NotConfigured } from '@/components/public/states';
import { getMyTeacherContext } from '@/lib/data/teacher';
import { missingForSubmission, profileEditMode, WIZARD_STEPS } from '@/lib/teacher/status';

export const metadata: Metadata = { title: 'Papan Pemuka Guru' };

const STATUS_HELP: Record<string, string> = {
  draft: 'Profil anda belum dihantar. Lengkapkan pendaftaran dan hantar untuk pengesahan.',
  submitted: 'Profil anda telah dihantar dan menunggu semakan pentadbir.',
  under_review: 'Pentadbir sedang menyemak profil anda.',
  revision_required: 'Pentadbir meminta pembetulan. Semak ulasan di bawah, kemas kini dan hantar semula.',
  approved: 'Profil anda telah diluluskan dan menunggu penerbitan.',
  published: 'Profil anda dipaparkan dalam direktori awam.',
  rejected: 'Permohonan profil anda ditolak. Hubungi pentadbir untuk maklumat lanjut.',
  suspended: 'Profil anda digantung. Hubungi pentadbir untuk maklumat lanjut.',
};

export default async function TeacherDashboardPage() {
  const ctx = await getMyTeacherContext();
  if (!ctx) return <NotConfigured />;
  const { teacher, profile, education, ijazah, submissions, changeRequests } = ctx;
  const status = teacher?.profile_verification_status ?? 'draft';
  const mode = profileEditMode(status);
  const reached = teacher?.onboarding_step ?? 2;
  const missing = missingForSubmission({
    hasTeacher: Boolean(teacher),
    fullName: teacher?.full_name_rumi,
    displayName: teacher?.public_display_name,
    teachingStateId: teacher?.teaching_state_id,
    primaryQiraatId: teacher?.primary_qiraat_id,
    shortBio: teacher?.short_bio,
  });
  const feedback = submissions.find((s) => s.decision_summary && s.status !== 'draft');
  const openChange = changeRequests.find((c) => c.status === 'submitted' || c.status === 'under_review');

  return (
    <>
      <PortalHeader
        title={`Assalamualaikum, ${profile.full_name.split(' ')[0]}`}
        description={teacher ? `Kod guru: ${teacher.teacher_code}` : 'Selamat datang ke Portal Guru MySanad.'}
      />

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-lg">Status profil</CardTitle>
            <CardDescription>{teacher ? STATUS_HELP[status] : 'Anda belum memulakan pendaftaran profil guru.'}</CardDescription>
          </div>
          {teacher ? <StatusBadge status={status} /> : null}
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          {mode === 'editable' && status !== 'submitted' ? (
            <Button asChild>
              <Link href="/teacher/register">
                {teacher ? 'Teruskan pendaftaran' : 'Mula pendaftaran'} <ArrowRight aria-hidden />
              </Link>
            </Button>
          ) : null}
          {teacher?.is_published ? (
            <Button asChild variant="outline">
              <Link href={`/directory/${teacher.id}`}>
                Lihat profil awam <ExternalLink aria-hidden />
              </Link>
            </Button>
          ) : null}
          <Button asChild variant="ghost">
            <Link href="/teacher/verification">Sejarah pengesahan</Link>
          </Button>
        </CardContent>
      </Card>

      {feedback && (status === 'revision_required' || status === 'rejected') ? (
        <Alert variant="destructive" className="flex gap-3">
          <MessageSquareWarning className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-semibold">Ulasan pentadbir</p>
            <p className="whitespace-pre-line">{feedback.decision_summary}</p>
          </div>
        </Alert>
      ) : null}

      {openChange ? (
        <Alert variant="info">Anda mempunyai permohonan perubahan profil yang sedang menunggu keputusan pentadbir.</Alert>
      ) : null}

      {mode === 'editable' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Senarai semak pendaftaran</CardTitle>
            <CardDescription>
              {missing.length ? `Masih diperlukan sebelum dihantar: ${missing.join(', ')}.` : 'Semua maklumat wajib telah lengkap.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-2 sm:grid-cols-2">
              {WIZARD_STEPS.map((s) => {
                const done = s.step === 1 || s.step < reached || (s.step === 7 && status === 'submitted');
                const reachable = s.step <= reached;
                const content = (
                  <span className="flex items-start gap-3">
                    {done ? (
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-label="Selesai" />
                    ) : (
                      <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-label="Belum selesai" />
                    )}
                    <span>
                      <span className="block text-sm font-medium text-forest-900">
                        {s.step}. {s.title}
                      </span>
                      <span className="block text-xs text-muted-foreground">{s.description}</span>
                    </span>
                  </span>
                );
                return (
                  <li key={s.step}>
                    {reachable && s.step > 1 ? (
                      <Link href={`/teacher/register?langkah=${s.step}`} className="block rounded-xl border p-3 hover:bg-secondary">
                        {content}
                      </Link>
                    ) : (
                      <div className="rounded-xl border p-3 opacity-80">{content}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Rekod pendidikan', value: education.length, href: '/teacher/education' },
          { label: 'Rekod ijazah', value: ijazah.length, href: '/teacher/ijazah' },
          { label: 'Permohonan semakan', value: submissions.length, href: '/teacher/verification' },
        ].map((x) => (
          <Link key={x.href} href={x.href} className="rounded-2xl border bg-card p-4 shadow-soft hover:border-primary">
            <p className="text-2xl font-bold text-forest-900">{x.value}</p>
            <p className="text-sm text-muted-foreground">{x.label}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
