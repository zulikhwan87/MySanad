import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PortalHeader } from '@/components/teacher/portal-header';
import { StatusBadge } from '@/components/teacher/status-badge';
import { ChangeRequestDecision } from '@/components/admin/change-request-decision';
import { fmtDate } from '@/components/admin/labels';
import { getChangeRequestDetail } from '@/lib/data/admin';
import { UuidSchema } from '@/lib/validations/search';

export const metadata: Metadata = { title: 'Permohonan Perubahan' };

export default async function ChangeRequestPage({ params }: { params: { requestId: string } }) {
  if (!UuidSchema.safeParse(params.requestId).success) notFound();
  const detail = await getChangeRequestDetail(params.requestId);
  if (!detail) notFound();
  const { request: r, rows } = detail;
  const open = r.status === 'submitted' || r.status === 'under_review';
  return (
    <>
      <Link href="/admin/verification?jenis=perubahan" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-forest-900">
        <ArrowLeft className="size-4" aria-hidden /> Permohonan perubahan
      </Link>
      <PortalHeader
        title={`Perubahan profil · ${r.teacher?.public_display_name ?? ''}`}
        description={`${r.teacher?.teacher_code ?? ''} · dihantar ${fmtDate(r.created_at, true)}`}
        actions={<StatusBadge status={r.status} />}
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Perbandingan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Medan</th>
                  <th className="py-2 pr-3">Semasa (disahkan)</th>
                  <th className="py-2">Dicadangkan</th>
                </tr>
              </thead>
              <tbody className="divide-y align-top">
                {rows.map((row) => (
                  <tr key={row.field}>
                    <td className="py-2 pr-3 font-medium">{row.field}</td>
                    <td className="whitespace-pre-line py-2 pr-3 text-muted-foreground">{row.current}</td>
                    <td className="whitespace-pre-line py-2 text-forest-900">{row.proposed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {r.applicant_notes ? <p className="text-sm">Sebab guru: {r.applicant_notes}</p> : null}
          {open ? <ChangeRequestDecision requestId={r.id} /> : r.decision_summary ? <p className="text-sm">Ulasan: {r.decision_summary}</p> : null}
          <Link href={`/admin/teachers/${r.teacher?.id}`} className="text-sm text-primary hover:underline">
            Lihat profil penuh guru →
          </Link>
        </CardContent>
      </Card>
    </>
  );
}
