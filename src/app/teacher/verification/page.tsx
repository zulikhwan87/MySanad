import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PortalHeader } from '@/components/teacher/portal-header';
import { StatusBadge } from '@/components/teacher/status-badge';
import { ChangeRequestList } from '@/components/teacher/change-request-list';
import { SubmitPanel } from '@/components/teacher/forms/submit-panel';
import { EmptyState, NotConfigured } from '@/components/public/states';
import { getMyTeacherContext } from '@/lib/data/teacher';

export const metadata: Metadata = { title: 'Status Pengesahan' };

const TARGET_LABELS: Record<string, string> = {
  teacher_profile: 'Profil guru',
  ijazah_document: 'Dokumen',
  sanad_chain: 'Rantaian sanad',
  sanad_node: 'Nod sanad',
  sanad_edge: 'Hubungan sanad',
};

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

export default async function TeacherVerificationPage() {
  const ctx = await getMyTeacherContext();
  if (!ctx) return <NotConfigured />;
  const { teacher, submissions, changeRequests, education, ijazah } = ctx;

  return (
    <>
      <PortalHeader
        title="Status Pengesahan"
        description="Pentadbir menyemak setiap jenis rekod secara berasingan: profil, pendidikan, ijazah, dokumen dan sanad."
        actions={teacher ? <StatusBadge status={teacher.profile_verification_status} /> : null}
      />

      {teacher?.profile_verification_status === 'submitted' ? (
        <Card>
          <CardContent className="pt-6">
            <SubmitPanel missing={[]} alreadySubmitted />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Permohonan semakan</CardTitle>
        </CardHeader>
        <CardContent>
          {submissions.length === 0 ? (
            <EmptyState title="Belum ada permohonan">Hantar profil anda melalui langkah 7 pendaftaran.</EmptyState>
          ) : (
            <ol className="space-y-3">
              {submissions.map((s) => (
                <li key={s.id} className="space-y-1 rounded-xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-forest-900">
                      {TARGET_LABELS[s.target_type] ?? s.target_type} · <span className="font-mono text-sm">{s.submission_code}</span>
                    </p>
                    <StatusBadge status={s.status} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Dihantar {fmt(s.submitted_at)}
                    {s.decided_at ? ` · Diputuskan ${fmt(s.decided_at)}` : ''}
                  </p>
                  {s.decision_summary ? <p className="text-sm">Ulasan: {s.decision_summary}</p> : null}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Status rekod</CardTitle>
          <CardDescription>Rekod yang disunting selepas disemak akan dihantar semula untuk semakan.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {[...education.map((e) => ({ id: e.id, label: `Pendidikan: ${e.institution_name}`, status: e.verification_status })),
              ...ijazah.map((i) => ({ id: i.id, label: `Ijazah: ${i.ijazah_title}`, status: i.verification_status }))].map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <span>{r.label}</span>
                <StatusBadge status={r.status} />
              </li>
            ))}
            {education.length + ijazah.length === 0 ? <li className="py-2 text-muted-foreground">Tiada rekod.</li> : null}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Permohonan perubahan</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangeRequestList items={changeRequests} />
        </CardContent>
      </Card>
    </>
  );
}
