'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileUp, Loader2, ShieldCheck } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SelectField, TextareaField } from '@/components/forms/fields';
import { registerDocumentAction } from '@/lib/actions/document-actions';
import {
  DOCUMENT_ACCEPT,
  DOCUMENT_EXT,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MIME,
  detectDocumentKind,
  formatBytes,
} from '@/lib/files/document-signature';
import { DOCUMENT_CATEGORIES } from '@/lib/validations/document';
import type { ActionResult } from '@/lib/validations/auth';
import { randomObjectName } from './random-name';

export interface UploadTargets {
  ijazah: Array<{ id: string; label: string }>;
  chains: Array<{ id: string; label: string }>;
}

export function DocumentUploader({
  userId,
  targets,
  defaults,
}: {
  userId: string;
  targets: UploadTargets;
  defaults: { category?: string; ijazahId?: string; chainId?: string };
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState(defaults.category ?? '');
  const [ijazahId, setIjazahId] = useState(defaults.ijazahId ?? '');
  const [chainId, setChainId] = useState(defaults.chainId ?? '');
  const [notes, setNotes] = useState('');
  const [showPublicly, setShowPublicly] = useState(false);
  const [stage, setStage] = useState<'idle' | 'checking' | 'uploading' | 'registering'>('idle');
  const [result, setResult] = useState<ActionResult | null>(null);
  const [, startTransition] = useTransition();
  const busy = stage !== 'idle';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    if (!category) return setResult({ ok: false, message: 'Pilih kategori dokumen.' });
    if (!file) return setResult({ ok: false, message: 'Pilih fail untuk dimuat naik.' });
    if (file.size === 0 || file.size > DOCUMENT_MAX_BYTES) return setResult({ ok: false, message: 'Saiz fail mesti antara 1 bait dan 15 MB.' });

    setStage('checking');
    const kind = detectDocumentKind(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
    if (!kind) {
      setStage('idle');
      return setResult({ ok: false, message: 'Hanya fail PDF, JPEG, PNG atau WebP yang sah dibenarkan.' });
    }

    setStage('uploading');
    const path = `${userId}/${randomObjectName()}.${DOCUMENT_EXT[kind]}`;
    const { createClient } = await import('@/lib/supabase/client');
    const upload = await createClient()
      .storage.from('private-ijazah-documents')
      .upload(path, file, { contentType: DOCUMENT_MIME[kind], upsert: false, cacheControl: '0' });
    if (upload.error) {
      setStage('idle');
      return setResult({ ok: false, message: 'Muat naik gagal. Semak saiz dan jenis fail, kemudian cuba lagi.' });
    }

    setStage('registering');
    const res = await registerDocumentAction({
      storage_path: path,
      category,
      original_filename: file.name,
      file_size_bytes: file.size,
      ijazah_record_id: ijazahId,
      sanad_chain_id: chainId,
      notes,
      show_publicly: category === 'Sijil Ijazah Sanad' && showPublicly,
    });
    setStage('idle');
    setResult(res);
    if (res.ok) {
      setFile(null);
      setNotes('');
      setShowPublicly(false);
      if (input.current) input.current.value = '';
      startTransition(() => router.refresh());
    }
  }

  return (
    <form noValidate onSubmit={submit} className="space-y-4">
      {result?.message ? (
        <Alert variant={result.ok ? 'success' : 'destructive'} aria-live="polite">
          {result.message}
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          id="doc-category"
          label="Kategori"
          required
          options={DOCUMENT_CATEGORIES.map((c) => ({ value: c, label: c }))}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        />
        <div className="space-y-1.5">
          <label htmlFor="doc-file" className="text-sm font-medium">
            Fail <span className="text-destructive" aria-hidden>*</span>
          </label>
          <input
            ref={input}
            id="doc-file"
            type="file"
            accept={DOCUMENT_ACCEPT}
            aria-describedby="doc-file-hint"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:font-medium"
          />
          <p id="doc-file-hint" className="text-xs text-muted-foreground">
            PDF, JPEG, PNG atau WebP, maksimum 15 MB.{file ? ` Dipilih: ${file.name} (${formatBytes(file.size)})` : ''}
          </p>
        </div>
        <SelectField
          id="doc-ijazah"
          label="Kaitkan dengan rekod ijazah"
          placeholder="Tiada"
          options={targets.ijazah.map((i) => ({ value: i.id, label: i.label }))}
          disabled={targets.ijazah.length === 0}
          value={ijazahId}
          onChange={(e) => setIjazahId(e.target.value)}
        />
        <SelectField
          id="doc-chain"
          label="Kaitkan dengan rantaian sanad"
          placeholder="Tiada"
          options={targets.chains.map((c) => ({ value: c.id, label: c.label }))}
          disabled={targets.chains.length === 0}
          value={chainId}
          onChange={(e) => setChainId(e.target.value)}
        />
        <TextareaField
          id="doc-notes"
          label="Catatan kepada pentadbir (pilihan)"
          rows={2}
          maxLength={1000}
          className="sm:col-span-2"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        {category === 'Sijil Ijazah Sanad' ? (
          <label htmlFor="doc-public" className="flex items-start gap-2 rounded-lg border bg-secondary/40 p-3 text-sm sm:col-span-2">
            <input
              id="doc-public"
              type="checkbox"
              checked={showPublicly}
              onChange={(e) => setShowPublicly(e.target.checked)}
              className="mt-0.5 size-4 accent-[hsl(var(--primary))]"
            />
            <span>
              <span className="font-medium">Paparkan sijil ini pada profil awam saya</span>
              <span className="block text-xs text-muted-foreground">
                Pelawat boleh membuka sijil melalui butang &quot;Papar sanad&quot; selepas pentadbir menyemaknya. Pastikan sijil tidak
                mengandungi No. MyKad, alamat atau maklumat peribadi lain yang anda tidak mahu didedahkan.
              </span>
            </span>
          </label>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 text-emerald-600" aria-hidden />
          {category === 'Sijil Ijazah Sanad' && showPublicly
            ? 'Disimpan secara peribadi sehingga diluluskan, kemudian dipaparkan pada profil awam anda.'
            : 'Disimpan secara peribadi. Hanya anda dan pentadbir yang diberi kuasa boleh melihatnya.'}
        </p>
        <Button type="submit" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <FileUp aria-hidden />}
          {stage === 'checking' ? 'Menyemak fail…' : stage === 'uploading' ? 'Memuat naik…' : stage === 'registering' ? 'Mendaftar…' : 'Muat naik'}
        </Button>
      </div>
    </form>
  );
}
