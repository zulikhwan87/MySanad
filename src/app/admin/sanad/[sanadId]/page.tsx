import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PortalHeader } from '@/components/teacher/portal-header';
import { StatusBadge } from '@/components/teacher/status-badge';
import { AdminSanadReview } from '@/components/admin/admin-sanad-review';
import { getChainForReview } from '@/lib/data/admin';
import { createServerSupabase } from '@/lib/supabase/server';
import { UuidSchema } from '@/lib/validations/search';

export const metadata: Metadata = { title: 'Semakan Sanad' };

export default async function AdminChainPage({ params }: { params: { sanadId: string } }) {
  if (!UuidSchema.safeParse(params.sanadId).success) notFound();
  const bundle = await getChainForReview(params.sanadId);
  if (!bundle) notFound();
  const { chain } = bundle;
  const { data: open } = await createServerSupabase()
    .from('verification_submissions')
    .select('id')
    .eq('target_type', 'sanad_chain')
    .eq('target_record_id', chain.id)
    .in('status', ['submitted', 'under_review'])
    .maybeSingle();

  return (
    <>
      <Link href="/admin/sanad" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-forest-900">
        <ArrowLeft className="size-4" aria-hidden /> Pengurusan Sanad
      </Link>
      <PortalHeader title={chain.title} description={`${chain.sanad_code} · ${[chain.qiraat, chain.riwayat, chain.tariq].filter(Boolean).join(' · ')}`} actions={<StatusBadge status={chain.verification_status} />} />
      {open ? (
        <Link href={`/admin/verification/${open.id}`} className="block rounded-xl border border-primary/40 bg-secondary p-3 text-sm font-medium text-primary hover:underline">
          Rantaian ini mempunyai permohonan semakan terbuka → buat keputusan
        </Link>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Graf (paparan pentadbir)</CardTitle>
          <CardDescription>Termasuk perawi dan hubungan yang belum disemak serta bukti sokongan sulit.</CardDescription>
        </CardHeader>
        <CardContent>
          <AdminSanadReview graph={bundle.graph} title={chain.title} editable={Boolean(open)} />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-2 pt-6 text-sm">
          <p>
            <span className="text-muted-foreground">Guru: </span>
            <Link href={`/admin/teachers/${chain.teacher_id}`} className="text-primary hover:underline">
              lihat profil
            </Link>
          </p>
          <p>
            <span className="text-muted-foreground">Kaedah: </span>
            {chain.transmission_method || 'Tidak dinyatakan'}
          </p>
          {chain.public_notes ? <p className="whitespace-pre-line">{chain.public_notes}</p> : null}
          {chain.internal_notes ? <p className="whitespace-pre-line text-gold-700">Catatan dalaman: {chain.internal_notes}</p> : null}
        </CardContent>
      </Card>
    </>
  );
}
