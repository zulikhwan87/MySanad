import type { Metadata } from 'next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PortalHeader } from '@/components/teacher/portal-header';
import { ChartCard } from '@/components/admin/analytics/chart-card';
import { DecisionBars, RankedBars, TrendLines } from '@/components/admin/analytics/charts';
import { TARGET_LABELS, fmtDate } from '@/components/admin/labels';
import { STATUS_LABELS } from '@/lib/teacher/status';
import { getAnalytics } from '@/lib/data/analytics';
import type { VerificationStatus } from '@/types/mysanad';

export const metadata: Metadata = { title: 'Analitik' };

const fmtHours = (h: number) => (h < 48 ? `${h} jam` : `${(h / 24).toFixed(1)} hari`);

export default async function AnalyticsPage() {
  const a = await getAnalytics();
  const total = Object.values(a.teachers_by_status).reduce((x, y) => x + y, 0);
  const published = a.teachers_by_status.published ?? 0;
  const open = (a.teachers_by_status.submitted ?? 0) + (a.teachers_by_status.under_review ?? 0);
  const profileTurnaround = a.turnaround_hours.find((t) => t.type === 'teacher_profile');
  const states = a.published_by_state.filter((s) => s.count > 0);
  const monthHasActivity = a.months.some((m) => m.registered || m.published);
  const decisionsHaveActivity = a.months.some((m) => m.approved || m.revision || m.rejected);
  const kpis = [
    { label: 'Guru berdaftar', value: total.toLocaleString('ms-MY') },
    { label: 'Diterbitkan', value: published.toLocaleString('ms-MY'), note: total ? `${Math.round((published / total) * 100)}% daripada berdaftar` : undefined },
    { label: 'Menunggu semakan profil', value: open.toLocaleString('ms-MY') },
    { label: 'Median masa semakan profil', value: profileTurnaround ? fmtHours(profileTurnaround.median) : '—', note: profileTurnaround ? `${profileTurnaround.decided} keputusan, 180 hari` : undefined },
  ];

  return (
    <>
      <PortalHeader
        title="Analitik"
        description={`Dikira terus daripada rekod pangkalan data pada ${fmtDate(a.generated_at, true)}.${a.demo_teachers ? ` Termasuk ${a.demo_teachers} rekod demonstrasi (fiksyen).` : ''}`}
      />
      <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-2xl border bg-card p-4 shadow-soft">
            <dt className="text-sm text-muted-foreground">{k.label}</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums text-forest-900">{k.value}</dd>
            {k.note ? <dd className="text-xs text-muted-foreground">{k.note}</dd> : null}
          </div>
        ))}
      </dl>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Pendaftaran & penerbitan guru"
          description="12 bulan terakhir"
          empty={!monthHasActivity}
          table={{ headers: ['Bulan', 'Berdaftar', 'Diterbitkan'], rows: a.months.map((m) => [m.month, m.registered, m.published]) }}
        >
          <TrendLines data={a.months} />
        </ChartCard>
        <ChartCard
          title="Keputusan semakan"
          description="Semua jenis rekod, 12 bulan terakhir"
          empty={!decisionsHaveActivity}
          table={{ headers: ['Bulan', 'Diluluskan', 'Pembetulan', 'Ditolak'], rows: a.months.map((m) => [m.month, m.approved, m.revision, m.rejected]) }}
        >
          <DecisionBars data={a.months} />
        </ChartCard>
        <ChartCard
          title="Guru diterbitkan mengikut negeri"
          description={`${states.length} daripada 16 negeri & WP mempunyai guru diterbitkan`}
          empty={states.length === 0}
          table={{ headers: ['Negeri', 'Guru'], rows: a.published_by_state.map((s) => [s.state, s.count]) }}
        >
          <RankedBars data={states.map((s) => ({ name: s.state.replace('Wilayah Persekutuan ', 'WP '), value: s.count }))} label="Guru diterbitkan" unit="guru" />
        </ChartCard>
        <ChartCard
          title="Rantaian sanad awam mengikut riwayat"
          empty={a.chains_by_riwayat.length === 0}
          table={{ headers: ['Riwayat', 'Rantaian'], rows: a.chains_by_riwayat.map((r) => [r.riwayat, r.count]) }}
        >
          <RankedBars data={a.chains_by_riwayat.map((r) => ({ name: r.riwayat, value: r.count }))} label="Rantaian awam" unit="rantaian" />
        </ChartCard>
        <ChartCard
          title="Institusi teratas"
          description="Mengikut bilangan guru diterbitkan"
          empty={a.top_institutions.length === 0}
          table={{ headers: ['Institusi', 'Guru'], rows: a.top_institutions.map((i) => [i.name, i.count]) }}
        >
          <RankedBars data={a.top_institutions.map((i) => ({ name: i.name, value: i.count }))} label="Guru diterbitkan" unit="guru" />
        </ChartCard>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status & masa semakan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <table className="w-full">
              <caption className="sr-only">Guru mengikut status profil</caption>
              <tbody className="divide-y">
                {(Object.keys(STATUS_LABELS) as VerificationStatus[]).map((s) => (
                  <tr key={s}>
                    <td className="py-1.5">{STATUS_LABELS[s]}</td>
                    <td className="py-1.5 text-right tabular-nums">{a.teachers_by_status[s] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="w-full">
              <caption className="mb-1 text-left font-semibold text-forest-900">Masa keputusan (180 hari)</caption>
              <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-1">Jenis</th>
                  <th className="py-1 text-right">Keputusan</th>
                  <th className="py-1 text-right">Median</th>
                  <th className="py-1 text-right">P90</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {a.turnaround_hours.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-2 text-muted-foreground">
                      Belum ada keputusan.
                    </td>
                  </tr>
                ) : (
                  a.turnaround_hours.map((t) => (
                    <tr key={t.type}>
                      <td className="py-1.5">{TARGET_LABELS[t.type] ?? t.type}</td>
                      <td className="py-1.5 text-right tabular-nums">{t.decided}</td>
                      <td className="py-1.5 text-right tabular-nums">{fmtHours(t.median)}</td>
                      <td className="py-1.5 text-right tabular-nums">{fmtHours(t.p90)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
