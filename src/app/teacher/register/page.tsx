import type { Metadata } from 'next';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PortalHeader } from '@/components/teacher/portal-header';
import { WizardStepper } from '@/components/teacher/wizard-stepper';
import { EditModeNotice } from '@/components/teacher/edit-mode-notice';
import { PersonalForm } from '@/components/teacher/forms/personal-form';
import { EducationManager } from '@/components/teacher/forms/education-manager';
import { QualificationsForm } from '@/components/teacher/forms/qualifications-form';
import { IjazahManager } from '@/components/teacher/forms/ijazah-manager';
import { TeachingForm } from '@/components/teacher/forms/teaching-form';
import { VisibilityForm } from '@/components/teacher/forms/visibility-form';
import { StepAdvance } from '@/components/teacher/forms/step-advance';
import { SubmitPanel } from '@/components/teacher/forms/submit-panel';
import { NotConfigured } from '@/components/public/states';
import { getMyTeacherContext, getTeacherReferenceData } from '@/lib/data/teacher';
import { isPiiEncryptionConfigured } from '@/lib/crypto/pii';
import { clampStep, missingForSubmission, profileEditMode, WIZARD_STEPS } from '@/lib/teacher/status';
import type { TeacherContext } from '@/lib/data/teacher';
import type { TeacherReferenceData } from '@/types/teacher';

export const metadata: Metadata = { title: 'Pendaftaran Guru' };

const href = (step: number) => `/teacher/register?langkah=${step}`;

function ReviewRow({ label, value, editStep }: { label: string; value: React.ReactNode; editStep: number }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b py-3 last:border-0">
      <div>
        <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd className="text-sm text-forest-900">{value || <span className="text-muted-foreground">Belum diisi</span>}</dd>
      </div>
      <Link href={href(editStep)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
        <Pencil className="size-3" aria-hidden /> Sunting
      </Link>
    </div>
  );
}

function Review({ ctx, reference }: { ctx: TeacherContext; reference: TeacherReferenceData }) {
  const t = ctx.teacher!;
  const find = (list: Array<{ id: string; label?: string; name?: string }>, id: string | null) => {
    const x = list.find((i) => i.id === id);
    return x ? (x.label ?? x.name) : null;
  };
  const visibleCount = Object.values(ctx.settings).filter(Boolean).length;
  return (
    <dl>
      <ReviewRow label="Nama" value={[t.professional_title, t.full_name_rumi].filter(Boolean).join(' ')} editStep={2} />
      <ReviewRow label="Nama Arab" value={t.full_name_arabic ? <span lang="ar" className="arabic">{t.full_name_arabic}</span> : null} editStep={2} />
      <ReviewRow label="Nama paparan" value={t.public_display_name} editStep={2} />
      <ReviewRow label="Pendidikan" value={ctx.education.length ? `${ctx.education.length} rekod` : null} editStep={3} />
      <ReviewRow
        label="Qiraat & riwayat"
        value={[find(reference.qiraat, t.primary_qiraat_id), find(reference.riwayat, t.primary_riwayat_id)].filter(Boolean).join(' · ')}
        editStep={4}
      />
      <ReviewRow label="Ijazah" value={ctx.ijazah.length ? `${ctx.ijazah.length} rekod` : null} editStep={4} />
      <ReviewRow
        label="Lokasi mengajar"
        value={[find(reference.districts, t.teaching_district_id), find(reference.states, t.teaching_state_id)].filter(Boolean).join(', ')}
        editStep={5}
      />
      <ReviewRow label="Institusi" value={find(reference.institutions, t.primary_institution_id)} editStep={5} />
      <ReviewRow label="Biografi ringkas" value={t.short_bio} editStep={5} />
      <ReviewRow label="Keterlihatan" value={`${visibleCount} daripada 8 pilihan dihidupkan`} editStep={6} />
    </dl>
  );
}

export default async function TeacherRegisterPage({ searchParams }: { searchParams: { langkah?: string } }) {
  const [ctx, reference] = await Promise.all([getMyTeacherContext(), getTeacherReferenceData()]);
  if (!ctx || !reference) return <NotConfigured />;

  const status = ctx.teacher?.profile_verification_status ?? 'draft';
  const mode = profileEditMode(status);
  const reached = ctx.teacher ? Math.max(2, ctx.teacher.onboarding_step) : 2;
  const step = clampStep(searchParams.langkah, reached);
  const meta = WIZARD_STEPS[step - 1];

  if (mode !== 'editable') {
    return (
      <>
        <PortalHeader title="Pendaftaran Guru" />
        <EditModeNotice mode={mode} />
      </>
    );
  }

  const missing = missingForSubmission({
    hasTeacher: Boolean(ctx.teacher),
    fullName: ctx.teacher?.full_name_rumi,
    displayName: ctx.teacher?.public_display_name,
    teachingStateId: ctx.teacher?.teaching_state_id,
    primaryQiraatId: ctx.teacher?.primary_qiraat_id,
    shortBio: ctx.teacher?.short_bio,
  });

  return (
    <>
      <PortalHeader
        title="Pendaftaran Guru"
        description="Maklumat disimpan pada setiap langkah. Anda boleh berhenti dan menyambung semula bila-bila masa."
      />
      <WizardStepper current={step} reached={reached} />
      <Card>
        <CardHeader>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Langkah {step} daripada 7</p>
          <CardTitle>{meta.title}</CardTitle>
          <CardDescription>{meta.description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {step === 2 ? (
            <PersonalForm teacher={ctx.teacher} reference={reference} piiEnabled={isPiiEncryptionConfigured()} nextHref={href(3)} />
          ) : null}
          {step === 3 ? (
            <>
              <EducationManager items={ctx.education} />
              <StepAdvance toStep={4} href={href(4)} label={ctx.education.length ? 'Teruskan' : 'Langkau buat masa ini'} />
            </>
          ) : null}
          {step === 4 && ctx.teacher ? (
            <>
              <QualificationsForm teacher={ctx.teacher} reference={reference} nextHref={href(5)} />
              <div className="space-y-3 border-t pt-6">
                <h3 className="font-semibold text-forest-900">Rekod ijazah (pilihan)</h3>
                <IjazahManager items={ctx.ijazah} reference={reference} />
              </div>
            </>
          ) : null}
          {step === 5 && ctx.teacher ? (
            <TeachingForm teacher={ctx.teacher} reference={reference} acceptingStudents={ctx.settings.accepting_students} nextHref={href(6)} />
          ) : null}
          {step === 6 ? <VisibilityForm settings={ctx.settings} nextHref={href(7)} submitLabel="Simpan & teruskan" /> : null}
          {step === 7 && ctx.teacher ? (
            <>
              <Review ctx={ctx} reference={reference} />
              <SubmitPanel missing={missing} alreadySubmitted={status === 'submitted'} />
            </>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
