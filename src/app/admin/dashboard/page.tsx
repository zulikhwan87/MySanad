import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, ClipboardCheck, FileText, GitBranch, PencilLine, UserRoundCheck, UsersRound, UserX } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PortalHeader } from '@/components/teacher/portal-header';
import { StatusBadge } from '@/components/teacher/status-badge';
import { EmptyState } from '@/components/public/states';
import { TARGET_LABELS, daysWaiting } from '@/components/admin/labels';
import { getDashboardCounts, getReviewQueue } from '@/lib/data/admin';

export const metadata: Metadata = { title: 'Papan Pemuka Pentadbir' };

export default async function AdminDashboardPage() {
  const [counts, queue] = await Promise.all([getDashboardCounts(), getReviewQueue({ open: true, page: 1 })]);
  const cards = [
    { label: 'Profil menunggu', value: counts.open_by_type.teacher_profile ?? 0, href: '/admin/verification?jenis=teacher_profile', icon: UserRoundCheck },
    { label: 'Dokumen menunggu', value: counts.open_by_type.ijazah_document ?? 0, href: '/admin/verification?jenis=ijazah_document', icon: FileText },
    { label: 'Sanad menunggu', value: counts.open_by_type.sanad_chain ?? 0, href: '/admin/verification?jenis=sanad_chain', icon: GitBranch },
    { label: 'Permohonan perubahan', value: counts.open_change_requests, href: '/admin/verification?jenis=perubahan', icon: PencilLine },
    { label: 'Guru diterbitkan', value: counts.teachers_published, href: '/admin/teachers?status=published', icon: UsersRound },
    { label: 'Guru digantung', value: counts.teachers_suspended, href: '/admin/teachers?status=suspended', icon: UserX },
    { label: 'Rantaian awam', value: counts.chains_public, href: '/admin/sanad?status=approved', icon: ClipboardCheck },
    { label: 'Institusi belum disahkan', value: counts.unverified_institutions, href: '/admin/institutions', icon: Building2 },
  ];

  return (
    <>
      <PortalHeader title="Papan Pemuka Pentadbir" description={`${counts.teachers_total} guru berdaftar · ${counts.pending_items} rekod pendidikan/ijazah menunggu semakan`} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(({ label, value, href, icon: Icon }) => (
          <Link key={label} href={href} className="rounded-2xl border bg-card p-4 shadow-soft hover:border-primary">
            <Icon className="size-5 text-emerald-600" aria-hidden />
            <p className="mt-2 text-2xl font-bold tabular-nums text-forest-900">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
          </Link>
        ))}
      </div>
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">Paling lama menunggu</CardTitle>
          <Link href="/admin/verification" className="text-sm font-medium text-primary hover:underline">
            Lihat semua →
          </Link>
        </CardHeader>
        <CardContent>
          {queue.items.length === 0 ? (
            <EmptyState title="Tiada permohonan menunggu" />
          ) : (
            <ul className="divide-y">
              {queue.items.slice(0, 6).map((s) => (
                <li key={s.id}>
                  <Link href={`/admin/verification/${s.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-secondary/40">
                    <span>
                      <span className="block font-medium text-forest-900">
                        {TARGET_LABELS[s.target_type]} · {s.teacher?.public_display_name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {s.submission_code} · menunggu {daysWaiting(s.submitted_at)} hari
                      </span>
                    </span>
                    <StatusBadge status={s.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
