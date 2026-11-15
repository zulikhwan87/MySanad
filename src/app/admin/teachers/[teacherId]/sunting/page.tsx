import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Info, Plus } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PortalHeader } from '@/components/teacher/portal-header';
import { StatusBadge } from '@/components/teacher/status-badge';
import { PersonalForm } from '@/components/teacher/forms/personal-form';
import { QualificationsForm } from '@/components/teacher/forms/qualifications-form';
import { EducationManager } from '@/components/teacher/forms/education-manager';
import { IjazahManager } from '@/components/teacher/forms/ijazah-manager';
import { TeachingForm } from '@/components/teacher/forms/teaching-form';
import { PrivateContactForm } from '@/components/teacher/forms/private-contact-form';
import { PhotoUploader } from '@/components/teacher/forms/photo-uploader';
import { VisibilityForm } from '@/components/teacher/forms/visibility-form';
import { SubmitPanel } from '@/components/teacher/forms/submit-panel';
import { DocumentUploader } from '@/components/documents/document-uploader';
import { DocumentList } from '@/components/documents/document-list';
import { LinkAccountForm } from '@/components/admin/link-account-form';
import { NotConfigured } from '@/components/public/states';
import { fmtDate } from '@/components/admin/labels';
import { getMyTeacherContext, getTeacherReferenceData } from '@/lib/data/teacher';
import { getMySanadChains } from '@/lib/data/sanad';
import { getMyDocuments } from '@/lib/data/documents';
import { getSessionProfile } from '@/lib/auth/session';
import { isPiiEncryptionConfigured } from '@/lib/crypto/pii';
import { missingForSubmission } from '@/lib/teacher/status';
import { UuidSchema } from '@/lib/validations/search';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Sunting Data Guru' };

const SECTIONS = [
  { id: 'peribadi', label: 'Peribadi' },
  { id: 'kelayakan', label: 'Kelayakan & ijazah' },
  { id: 'pengajaran', label: 'Pengajaran' },
  { id: 'gambar', label: 'Gambar' },
  { id: 'dokumen', label: 'Dokumen' },
  { id: 'sanad', label: 'Sanad' },
  { id: 'keterlihatan', label: 'Keterlihatan' },
  { id: 'hantar', label: 'Hantar & akaun' },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminEditTeacherPage({
  params,
  searchParams,
}: {
  params: { teacherId: string };
  searchParams: Record<string, string | string[] | undefined>;
}) {
  if (!UuidSchema.safeParse(params.teacherId).success) notFound();
  const teacherId = params.teacherId;
  const [ctx, reference, session] = await Promise.all([getMyTeacherContext(teacherId), getTeacherReferenceData(), getSessionProfile()]);
  if (!ctx || !reference || !session) return <NotConfigured />;
  if (!ctx.teacher) notFound();
  const t = ctx.teacher;

  const requested = first(searchParams.bahagian);
  const section: SectionId = SECTIONS.some((s) => s.id === requested) ? (requested as SectionId) : 'peribadi';
  const base = `/admin/teachers/${teacherId}/sunting`;
  const href = (id: SectionId) => `${base}?bahagian=${id}`;
  const managed = Boolean(t.managed_by_admin);

  const [chains, documents] = await Promise.all([
    section === 'sanad' || section === 'dokumen' ? getMySanadChains(teacherId) : Promise.resolve(null),
    section === 'dokumen' ? getMyDocuments(teacherId) : Promise.resolve(null),
  ]);

  return (
    <>
      <Link href={`/admin/teachers/${teacherId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-forest-900">
        <ArrowLeft className="size-4" aria-hidden /> Butiran guru
      </Link>
      <PortalHeader
        title={`Sunting: ${t.public_display_name}`}
        description={`${t.teacher_code ?? ''} · ${managed ? 'Profil diurus pentadbir (tiada akaun)' : 'Guru mempunyai akaun sendiri'}`}
        actions={<StatusBadge status={t.profile_verification_status} />}
      />

      {!managed ? (
        <Alert className="flex gap-3">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            Guru ini mengurus profilnya sendiri. Perubahan anda disimpan terus{t.is_published ? ' dan dipaparkan serta-merta pada profil awam' : ''},
            direkod dalam log audit, dan guru akan dimaklumkan.
          </span>
        </Alert>
      ) : null}

      <nav aria-label="Bahagian data guru" className="flex gap-1 overflow-x-auto border-b">
        {SECTIONS.map((s) => (
          <Link
            key={s.id}
            href={href(s.id)}
            aria-current={s.id === section ? 'page' : undefined}
            className={cn(
              'whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium',
              s.id === section ? 'border-primary text-forest-900' : 'border-transparent text-muted-foreground hover:text-forest-900',
            )}
          >
            {s.label}
          </Link>
        ))}
      </nav>

      {section === 'peribadi' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Maklumat peribadi</CardTitle>
            <CardDescription>Nama, gelaran dan maklumat peribadi (tidak dipaparkan kepada awam kecuali nama).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
            <PersonalForm teacher={t} reference={reference} piiEnabled={isPiiEncryptionConfigured()} nextHref={href('peribadi')} teacherId={teacherId} submitLabel="Simpan" />
          </CardContent>
        </Card>
      ) : null}

      {section === 'kelayakan' ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Qiraat & pengkhususan</CardTitle>
            </CardHeader>
            <CardContent>
              <QualificationsForm teacher={t} reference={reference} nextHref={href('kelayakan')} teacherId={teacherId} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Rekod ijazah</CardTitle>
            </CardHeader>
            <CardContent>
              <IjazahManager items={ctx.ijazah} reference={reference} teacherId={teacherId} documentsHref={href('dokumen')} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Pendidikan</CardTitle>
            </CardHeader>
            <CardContent>
              <EducationManager items={ctx.education} teacherId={teacherId} />
            </CardContent>
          </Card>
        </>
      ) : null}

      {section === 'pengajaran' ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Pengajaran</CardTitle>
              <CardDescription>Lokasi mengajar, institusi, pengalaman dan biografi.</CardDescription>
            </CardHeader>
            <CardContent>
              <TeachingForm teacher={t} reference={reference} acceptingStudents={ctx.settings.accepting_students} teacherId={teacherId} submitLabel="Simpan" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Hubungan peribadi</CardTitle>
              <CardDescription>Untuk kegunaan pentadbir sahaja.</CardDescription>
            </CardHeader>
            <CardContent>
              <PrivateContactForm teacher={t} reference={reference} teacherId={teacherId} />
            </CardContent>
          </Card>
        </>
      ) : null}

      {section === 'gambar' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Gambar guru</CardTitle>
            <CardDescription>JPEG, PNG atau WebP, maksimum 2 MB. Dipaparkan pada kad dan profil guru.</CardDescription>
          </CardHeader>
          <CardContent>
            <PhotoUploader userId={session.id} name={t.public_display_name} photoUrl={t.photo_url} canRemove needsReview={false} teacherId={teacherId} />
          </CardContent>
        </Card>
      ) : null}

      {section === 'dokumen' ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Muat naik dokumen</CardTitle>
              <CardDescription>
                Untuk Sijil Ijazah Sanad, tandakan &quot;Paparkan sijil ini pada profil awam&quot; jika guru bersetuju sijilnya dipaparkan
                melalui butang Papar Sanad.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DocumentUploader
                userId={session.id}
                teacherId={teacherId}
                targets={{
                  ijazah: ctx.ijazah.map((i) => ({ id: i.id, label: i.ijazah_title })),
                  chains: (chains ?? []).map((c) => ({ id: c.id, label: `${c.title} (${c.sanad_code})` })),
                }}
                defaults={{ ijazahId: first(searchParams.ijazah), chainId: first(searchParams.sanad) }}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Dokumen guru</CardTitle>
              <CardDescription>Dokumen baharu masuk ke Barisan Semakan; luluskan di sana.</CardDescription>
            </CardHeader>
            <CardContent>
              <DocumentList
                adminView
                documents={(documents ?? []).map((d) => ({
                  ...d,
                  link: d.ijazah ? `Ijazah: ${d.ijazah.ijazah_title}` : d.sanad_chain ? `Sanad: ${d.sanad_chain.title}` : null,
                }))}
              />
            </CardContent>
          </Card>
        </>
      ) : null}

      {section === 'sanad' ? (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
            <div>
              <CardTitle className="text-lg">Rantaian sanad</CardTitle>
              <CardDescription>Bina rantaian bermula daripada guru yang memberi ijazah kepada guru ini.</CardDescription>
            </div>
            <Button asChild size="sm">
              <Link href={`${base}/sanad/baru`}>
                <Plus aria-hidden /> Rantaian baharu
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {chains && chains.length ? (
              <ul className="divide-y rounded-xl border">
                {chains.map((c) => (
                  <li key={c.id}>
                    <Link href={`${base}/sanad/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-secondary/60">
                      <span className="min-w-0">
                        <span className="block font-medium text-forest-900">{c.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {c.sanad_code} · {[c.qiraat, c.riwayat].filter(Boolean).join(' · ')} · {c.edge_count} hubungan · {fmtDate(c.updated_at)}
                        </span>
                      </span>
                      <StatusBadge status={c.verification_status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Belum ada rantaian sanad.</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {section === 'keterlihatan' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Keterlihatan awam</CardTitle>
            <CardDescription>Pilih maklumat yang dipaparkan pada profil awam guru.</CardDescription>
          </CardHeader>
          <CardContent>
            <VisibilityForm settings={ctx.settings} teacherId={teacherId} />
          </CardContent>
        </Card>
      ) : null}

      {section === 'hantar' ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Hantar untuk semakan & terbitkan</CardTitle>
              <CardDescription>
                Penghantaran memasukkan profil ke Barisan Semakan. Buka permohonan itu untuk menerbitkan profil, kemudian luluskan
                rantaian sanad dan dokumen.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {t.profile_verification_status === 'draft' || t.profile_verification_status === 'revision_required' ? (
                <SubmitPanel
                  teacherId={teacherId}
                  alreadySubmitted={false}
                  missing={missingForSubmission({
                    hasTeacher: true,
                    fullName: t.full_name_rumi,
                    displayName: t.public_display_name,
                    teachingStateId: t.teaching_state_id,
                    primaryQiraatId: t.primary_qiraat_id,
                    shortBio: t.short_bio,
                  })}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Status profil: <StatusBadge status={t.profile_verification_status} />. Perubahan anda disimpan terus.
                </p>
              )}
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/verification">Buka Barisan Semakan</Link>
              </Button>
            </CardContent>
          </Card>
          {managed ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Pautkan kepada akaun (pilihan)</CardTitle>
                <CardDescription>
                  Jika guru atau ahli keluarganya kemudian mendaftar akaun, pautkan profil ini supaya mereka boleh mengurusnya sendiri.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <LinkAccountForm teacherId={teacherId} />
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}
    </>
  );
}
