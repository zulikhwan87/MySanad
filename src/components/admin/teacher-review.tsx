import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/teacher/status-badge';
import { TeacherAvatar } from '@/components/public/teacher-avatar';
import { DemoBadge } from '@/components/public/verification-badges';
import { ItemStatusButtons } from './item-status-buttons';
import { RevealIc } from './reveal-ic';
import { DocumentButtons } from './document-buttons';
import { TARGET_LABELS, fmtDate } from './labels';
import type { TeacherReviewBundle } from '@/lib/data/admin';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[200px_1fr]">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm text-forest-900">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="font-semibold text-forest-900">{title}</h3>
      {children}
    </section>
  );
}

/** Everything a reviewer needs about a teacher, including private fields (admin pages only). */
export function TeacherReview({ bundle, itemActions }: { bundle: TeacherReviewBundle; itemActions: boolean }) {
  const t = bundle.teacher;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-4">
        <TeacherAvatar name={t.public_display_name} photoUrl={t.photo_url} size={72} />
        <div className="space-y-1">
          <p className="text-lg font-semibold text-forest-900">{t.public_display_name}</p>
          <p className="text-sm text-muted-foreground">
            <span className="font-mono">{t.teacher_code}</span> · {t.email}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge status={t.profile_verification_status} />
            {t.is_demo_record ? <DemoBadge /> : null}
            {t.documents_reviewed_badge ? <Badge variant="secondary">Dokumen Disemak</Badge> : null}
            {t.sanad_reviewed_badge ? <Badge variant="gold">Jalur Sanad Disemak</Badge> : null}
          </div>
        </div>
      </div>

      <Section title="Maklumat profil">
        <dl className="divide-y">
          <Row label="Nama penuh (Rumi)">{t.full_name_rumi}</Row>
          <Row label="Nama penuh (Arab)">{t.full_name_arabic ? <span lang="ar" className="arabic">{t.full_name_arabic}</span> : null}</Row>
          <Row label="Gelaran">{t.professional_title}</Row>
          <Row label="Ejaan alternatif">{t.alternative_spellings?.join(', ')}</Row>
          <Row label="Jantina">{t.gender}</Row>
          <Row label="Lokasi mengajar">{t.labels.teaching}</Row>
          <Row label="Institusi">{t.labels.institution}</Row>
          <Row label="Qiraat / riwayat">{[t.labels.qiraat, t.labels.riwayat].filter(Boolean).join(' · ')}</Row>
          <Row label="Pengalaman">{t.teaching_experience_years !== null ? `${t.teaching_experience_years} tahun` : null}</Row>
          <Row label="Pengkhususan">{t.specializations?.join(', ')}</Row>
          <Row label="Biografi ringkas">{t.short_bio}</Row>
          <Row label="Biografi penuh">{t.full_biography ? <span className="whitespace-pre-line">{t.full_biography}</span> : null}</Row>
        </dl>
      </Section>

      <Section title="Maklumat sulit (pentadbir sahaja)">
        <dl className="divide-y rounded-xl border border-gold-200 bg-gold-50/50 px-3">
          <Row label="No. MyKad">
            <RevealIc teacherId={t.id} masked={t.ic_masked} />
          </Row>
          <Row label="Telefon peribadi">{t.private_phone}</Row>
          <Row label="Alamat kediaman">{[t.residential_address, t.labels.residential].filter(Boolean).join(', ')}</Row>
        </dl>
      </Section>

      <Section title={`Pendidikan (${bundle.education.length})`}>
        <ul className="divide-y rounded-xl border">
          {bundle.education.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span>
                {e.qualification_level} · {e.field_of_study} — {e.institution_name}, {e.country} {e.graduation_year ? `(${e.graduation_year})` : ''}
                {!e.is_public ? <span className="text-muted-foreground"> · tidak awam</span> : null}
              </span>
              <span className="flex items-center gap-2">
                <StatusBadge status={e.verification_status} />
                {itemActions ? <ItemStatusButtons table="teacher_education" id={e.id} label={e.institution_name} /> : null}
              </span>
            </li>
          ))}
          {bundle.education.length === 0 ? <li className="p-3 text-sm text-muted-foreground">Tiada.</li> : null}
        </ul>
      </Section>

      <Section title={`Ijazah (${bundle.ijazah.length})`}>
        <ul className="divide-y rounded-xl border">
          {bundle.ijazah.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span>
                {i.ijazah_title} — {i.granting_sheikh_rumi}
                {i.conferral_date ? ` (${i.conferral_date})` : ''}
              </span>
              <span className="flex items-center gap-2">
                <StatusBadge status={i.verification_status} />
                {itemActions ? <ItemStatusButtons table="ijazah_records" id={i.id} label={i.ijazah_title} /> : null}
              </span>
            </li>
          ))}
          {bundle.ijazah.length === 0 ? <li className="p-3 text-sm text-muted-foreground">Tiada.</li> : null}
        </ul>
      </Section>

      {bundle.contacts.length ? (
        <Section title="Saluran hubungan awam">
          <ul className="divide-y rounded-xl border">
            {bundle.contacts.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <span>
                  {c.label}: {c.contact_value}
                </span>
                <span className="flex items-center gap-2">
                  <Badge variant={c.is_approved ? 'secondary' : 'outline'}>{c.is_approved ? 'Diluluskan' : 'Belum diluluskan'}</Badge>
                  {itemActions ? <ItemStatusButtons table="public_contact_channels" id={c.id} label={c.label} /> : null}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title={`Dokumen (${bundle.documents.length})`}>
        <ul className="divide-y rounded-xl border">
          {bundle.documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span>
                {d.original_filename} <span className="text-muted-foreground">· {d.category} · {fmtDate(d.uploaded_at)}</span>
              </span>
              <span className="flex items-center gap-2">
                <StatusBadge status={d.review_status} />
                <DocumentButtons id={d.id} name={d.original_filename} />
              </span>
            </li>
          ))}
          {bundle.documents.length === 0 ? <li className="p-3 text-sm text-muted-foreground">Tiada.</li> : null}
        </ul>
      </Section>

      <Section title="Rantaian sanad & permohonan">
        <ul className="space-y-1 text-sm">
          {bundle.chains.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-2">
              <Link href={`/admin/sanad/${c.id}`} className="text-primary hover:underline">
                {c.title} <span className="font-mono text-xs">({c.sanad_code})</span>
              </Link>
              <StatusBadge status={c.verification_status} />
            </li>
          ))}
          {bundle.submissions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-2">
              <Link href={`/admin/verification/${s.id}`} className="text-primary hover:underline">
                {TARGET_LABELS[s.target_type]} · <span className="font-mono text-xs">{s.submission_code}</span>
              </Link>
              <StatusBadge status={s.status} />
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
