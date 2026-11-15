'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Eye, EyeOff, FileText, Globe, Image as ImageIcon, Loader2, Trash2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/teacher/status-badge';
import { deleteDocumentAction, setDocumentPublicAction } from '@/lib/actions/document-actions';
import { formatBytes } from '@/lib/files/document-signature';
import type { ActionResult } from '@/lib/validations/auth';
import type { VerificationStatus } from '@/types/mysanad';

export interface DocumentRow {
  id: string;
  category: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  review_status: VerificationStatus;
  review_notes: string | null;
  uploaded_at: string;
  show_publicly?: boolean;
  link: string | null;
}

const DELETABLE: VerificationStatus[] = ['draft', 'submitted', 'revision_required', 'rejected'];

/** Requests a 60-second signed URL from the server and opens it. */
export async function openSigned(id: string, download: boolean): Promise<string | null> {
  const res = await fetch(`/api/documents/${id}/signed-url${download ? '?muat-turun=1' : ''}`, { cache: 'no-store' });
  const body = (await res.json().catch(() => ({}))) as { signedUrl?: string; error?: string };
  if (!res.ok || !body.signedUrl) return body.error ?? 'Pautan tidak dapat dijana.';
  if (download) window.location.assign(body.signedUrl);
  else window.open(body.signedUrl, '_blank', 'noopener,noreferrer');
  return null;
}

export function DocumentList({ documents }: { documents: DocumentRow[] }) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function view(id: string, download: boolean) {
    setBusy(`${id}:${download}`);
    const error = await openSigned(id, download);
    setBusy(null);
    if (error) setResult({ ok: false, message: error });
  }

  function remove(d: DocumentRow) {
    if (!window.confirm(`Padam "${d.original_filename}"? Fail akan dibuang secara kekal.`)) return;
    setBusy(`${d.id}:delete`);
    startTransition(async () => {
      const res = await deleteDocumentAction(d.id);
      setBusy(null);
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  function togglePublic(d: DocumentRow) {
    const show = !d.show_publicly;
    if (show && (d.review_status === 'approved' || d.review_status === 'published')) {
      if (!window.confirm('Sijil ini akan disemak semula oleh pentadbir sebelum dipaparkan kepada awam. Teruskan?')) return;
    }
    setBusy(`${d.id}:public`);
    startTransition(async () => {
      const res = await setDocumentPublicAction(d.id, show);
      setBusy(null);
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  if (documents.length === 0) return <p className="text-sm text-muted-foreground">Belum ada dokumen dimuat naik.</p>;

  return (
    <div className="space-y-3">
      {result?.message ? <Alert variant={result.ok ? 'success' : 'destructive'}>{result.message}</Alert> : null}
      <ul className="space-y-3">
        {documents.map((d) => {
          const Icon = d.mime_type === 'application/pdf' ? FileText : ImageIcon;
          return (
            <li key={d.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-4">
              <div className="flex min-w-0 gap-3">
                <Icon className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
                <div className="min-w-0">
                  <p className="truncate font-medium text-forest-900" title={d.original_filename}>
                    {d.original_filename}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {d.category} · {formatBytes(d.file_size_bytes)} ·{' '}
                    {new Date(d.uploaded_at).toLocaleDateString('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {d.link ? ` · ${d.link}` : ''}
                  </p>
                  {d.review_notes ? <p className="mt-1 text-sm">Ulasan pentadbir: {d.review_notes}</p> : null}
                  {d.show_publicly ? (
                    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-emerald-700">
                      <Globe className="size-3.5" aria-hidden />
                      {d.review_status === 'approved' || d.review_status === 'published'
                        ? 'Dipaparkan pada profil awam'
                        : 'Akan dipaparkan pada profil awam selepas diluluskan'}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <StatusBadge status={d.review_status} />
                <Button variant="ghost" size="icon" aria-label={`Lihat ${d.original_filename}`} disabled={busy !== null} onClick={() => void view(d.id, false)}>
                  {busy === `${d.id}:false` ? <Loader2 className="animate-spin" aria-hidden /> : <Eye aria-hidden />}
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Muat turun ${d.original_filename}`} disabled={busy !== null} onClick={() => void view(d.id, true)}>
                  {busy === `${d.id}:true` ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
                </Button>
                {d.category === 'Sijil Ijazah Sanad' && d.review_status !== 'rejected' && d.review_status !== 'suspended' ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => togglePublic(d)}
                    aria-label={d.show_publicly ? `Sembunyikan ${d.original_filename} daripada profil awam` : `Paparkan ${d.original_filename} pada profil awam`}
                  >
                    {busy === `${d.id}:public` ? <Loader2 className="animate-spin" aria-hidden /> : d.show_publicly ? <EyeOff aria-hidden /> : <Globe aria-hidden />}
                    {d.show_publicly ? 'Sembunyikan' : 'Paparkan awam'}
                  </Button>
                ) : null}
                {DELETABLE.includes(d.review_status) ? (
                  <Button variant="ghost" size="icon" aria-label={`Padam ${d.original_filename}`} disabled={busy !== null} onClick={() => remove(d)}>
                    {busy === `${d.id}:delete` ? <Loader2 className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
