'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ImageUp, Loader2, Trash2 } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { TeacherAvatar } from '@/components/public/teacher-avatar';
import { detectImageKind, PHOTO_EXT, PHOTO_MAX_BYTES, PHOTO_MIME } from '@/lib/files/image-signature';
import { removeProfilePhotoAction, setProfilePhotoAction } from '@/lib/actions/teacher-actions';
import type { ActionResult } from '@/lib/validations/auth';

function randomName(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 16);
}

export function PhotoUploader({
  userId,
  name,
  photoUrl,
  canRemove,
  needsReview,
}: {
  userId: string;
  name: string;
  photoUrl: string | null;
  canRemove: boolean;
  needsReview: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  async function upload(file: File) {
    if (file.size > PHOTO_MAX_BYTES) return setResult({ ok: false, message: 'Saiz fail melebihi 2 MB.' });
    const kind = detectImageKind(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
    if (!kind) return setResult({ ok: false, message: 'Hanya imej JPEG, PNG atau WebP dibenarkan.' });

    startTransition(async () => {
      setResult(null);
      const path = `${userId}/avatar-${randomName()}.${PHOTO_EXT[kind]}`;
      // Loaded on demand so the Supabase browser bundle is only fetched when uploading.
      const { createClient } = await import('@/lib/supabase/client');
      const { error } = await createClient()
        .storage.from('teacher-photos')
        .upload(path, file, { contentType: PHOTO_MIME[kind], upsert: false, cacheControl: '3600' });
      if (error) {
        setResult({ ok: false, message: 'Muat naik gagal. Sila cuba lagi.' });
        return;
      }
      const res = await setProfilePhotoAction(path);
      setResult(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <TeacherAvatar name={name} photoUrl={photoUrl} size={96} />
      <div className="space-y-2">
        {result?.message ? <Alert variant={result.ok ? 'success' : 'destructive'}>{result.message}</Alert> : null}
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            id="photo-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void upload(f);
            }}
          />
          <Button type="button" variant="outline" disabled={pending} onClick={() => input.current?.click()}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <ImageUp aria-hidden />}
            {photoUrl ? 'Tukar foto' : 'Muat naik foto'}
          </Button>
          {photoUrl && canRemove ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await removeProfilePhotoAction();
                  setResult(res);
                  if (res.ok) router.refresh();
                })
              }
            >
              <Trash2 aria-hidden /> Buang
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          JPEG, PNG atau WebP, maksimum 2 MB.{needsReview ? ' Foto baharu akan disemak sebelum dipaparkan.' : ''}
        </p>
      </div>
    </div>
  );
}
