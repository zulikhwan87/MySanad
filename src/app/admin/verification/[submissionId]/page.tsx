import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PortalHeader } from '@/components/teacher/portal-header';
import { StatusBadge } from '@/components/teacher/status-badge';
import { DecisionPanel } from '@/components/admin/decision-panel';
import { ReviewHistory } from '@/components/admin/review-history';
import { TeacherReview } from '@/components/admin/teacher-review';
import { AdminSanadReview } from '@/components/admin/admin-sanad-review';
import { DocumentButtons } from '@/components/admin/document-buttons';
import { TARGET_LABELS, fmtDate } from '@/components/admin/labels';
import { getSubmissionDetail } from '@/lib/data/admin';
import { formatBytes } from '@/lib/files/document-signature';
import { UuidSchema } from '@/lib/validations/search';

export const metadata: Metadata = { title: 'Semakan Permohonan' };

export default async function SubmissionReviewPage({ params }: { params: { submissionId: string } }) {
  if (!UuidSchema.safeParse(params.submissionId).success) notFound();
  const detail = await getSubmissionDetail(params.submissionId);
  if (!detail) notFound();
  const { submission: s } = detail;
  const open = s.status === 'submitted' || s.status === 'under_review';

  return (
    <>
      <Link href="/admin/verification" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-forest-900">
        <ArrowLeft className="size-4" aria-hidden /> Barisan Semakan
      </Link>
      <PortalHeader
        title={`${TARGET_LABELS[s.target_type]} · ${s.teacher?.public_display_name ?? ''}`}
        description={`${s.submission_code} · dihantar ${fmtDate(s.submitted_at, true)}${s.reviewer ? ` · penyemak: ${s.reviewer.full_name}` : ''}`}
        actions={<StatusBadge status={s.status} />}
      />
      {s.applicant_notes ? (
        <Card>
          <CardContent className="pt-6 text-sm">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Catatan guru</p>
            <p className="whitespace-pre-line">{s.applicant_notes}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-6">
          {s.target_type === 'ijazah_document' && detail.document ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Dokumen</CardTitle>
                <CardDescription>Dibuka melalui pautan bertandatangan 60 saat; setiap akses direkod dalam log audit.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="flex flex-wrap items-center gap-2 font-medium text-forest-900">
                  {detail.document.original_filename}
                  <DocumentButtons id={detail.document.id} name={detail.document.original_filename} />
                </p>
                <p className="text-muted-foreground">
                  {detail.document.category} · {detail.document.mime_type} · {formatBytes(detail.document.file_size_bytes)} · {fmtDate(detail.document.uploaded_at)}
                </p>
                {detail.document.show_publicly ? (
                  <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
                    <strong>Guru meminta sijil ini dipaparkan pada profil awam.</strong> Jika diluluskan, pelawat boleh membukanya
                    melalui butang &quot;Papar sanad&quot;. Pastikan tiada No. MyKad, alamat atau maklumat peribadi lain sebelum
                    meluluskan; jika ada, minta pembetulan.
                  </p>
                ) : null}
                {detail.document.ijazah ? (
                  <p>
                    Dikaitkan dengan ijazah: {detail.document.ijazah.ijazah_title} ({detail.document.ijazah.granting_sheikh_rumi})
                  </p>
                ) : null}
                {detail.document.chain ? (
                  <p>
                    Dikaitkan dengan sanad:{' '}
                    <Link href={`/admin/sanad/${detail.document.chain.id}`} className="text-primary hover:underline">
                      {detail.document.chain.title}
                    </Link>
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {s.target_type === 'sanad_chain' && detail.chain ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{detail.chain.chain.title}</CardTitle>
                <CardDescription>
                  {[detail.chain.chain.qiraat, detail.chain.chain.riwayat, detail.chain.chain.tariq].filter(Boolean).join(' · ')} ·{' '}
                  {detail.chain.chain.generation_depth ?? '?'} peringkat
                  {detail.chain.chain.supersedes_chain_id ? ' · semakan kepada rantaian terdahulu (akan menggantikannya jika diluluskan)' : ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <AdminSanadReview graph={detail.chain.graph} title={detail.chain.chain.title} editable={open} />
                {detail.chain.documents.length ? (
                  <div className="text-sm">
                    <p className="font-semibold text-forest-900">Dokumen sokongan</p>
                    <ul>
                      {detail.chain.documents.map((d) => (
                        <li key={d.id} className="flex items-center gap-2">
                          {d.original_filename} <StatusBadge status={d.review_status} />
                          <DocumentButtons id={d.id} name={d.original_filename} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {detail.teacher ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{s.target_type === 'teacher_profile' ? 'Profil untuk disemak' : 'Profil guru'}</CardTitle>
              </CardHeader>
              <CardContent>
                <TeacherReview bundle={detail.teacher} itemActions={s.target_type === 'teacher_profile' && open} />
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6 xl:sticky xl:top-24 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Keputusan</CardTitle>
              <CardDescription>
                Keputusan mendokumenkan semakan pentadbir. Ia bukan pengisytiharan kesahihan sanad atau pentauliahan.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DecisionPanel submissionId={s.id} status={s.status} targetType={s.target_type} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Sejarah semakan</CardTitle>
            </CardHeader>
            <CardContent>
              <ReviewHistory reviews={detail.reviews} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
