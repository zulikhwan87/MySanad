'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Pause, Play, Star } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { setFeaturedAction, setPublicationAction } from '@/lib/actions/admin-actions';
import type { ActionResult } from '@/lib/validations/auth';
import type { VerificationStatus } from '@/types/mysanad';

export function PublicationControls({
  teacherId,
  status,
  isPublished,
  isFeatured,
}: {
  teacherId: string;
  status: VerificationStatus;
  isPublished: boolean;
  isFeatured: boolean;
}) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<ActionResult>) =>
    startTransition(async () => {
      const res = await fn();
      setResult(res);
      if (res.ok) router.refresh();
    });
  const withReason = (action: 'unpublish' | 'suspend', prompt: string) => {
    const reason = window.prompt(prompt);
    if (reason?.trim()) run(() => setPublicationAction({ teacher_id: teacherId, action, reason }));
  };

  return (
    <div className="space-y-3">
      {result?.message ? <Alert variant={result.ok ? 'success' : 'destructive'}>{result.message}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        {status === 'approved' ? (
          <Button size="sm" disabled={pending} onClick={() => window.confirm('Terbitkan profil ini?') && run(() => setPublicationAction({ teacher_id: teacherId, action: 'publish' }))}>
            <Eye aria-hidden /> Terbitkan
          </Button>
        ) : null}
        {isPublished ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => withReason('unpublish', 'Sebab menarik balik penerbitan (dimaklumkan kepada guru):')}>
            <EyeOff aria-hidden /> Tarik balik penerbitan
          </Button>
        ) : null}
        {status !== 'suspended' && (isPublished || status === 'approved') ? (
          <Button size="sm" variant="destructive" disabled={pending} onClick={() => withReason('suspend', 'Sebab penggantungan (dimaklumkan kepada guru):')}>
            <Pause aria-hidden /> Gantung
          </Button>
        ) : null}
        {status === 'suspended' ? (
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setPublicationAction({ teacher_id: teacherId, action: 'reinstate' }))}>
            <Play aria-hidden /> Pulihkan
          </Button>
        ) : null}
        {isPublished ? (
          <Button size="sm" variant="ghost" disabled={pending} aria-pressed={isFeatured} onClick={() => run(() => setFeaturedAction(teacherId, !isFeatured))}>
            <Star aria-hidden className={isFeatured ? 'fill-gold-400 text-gold-500' : undefined} /> {isFeatured ? 'Buang daripada pilihan' : 'Jadikan pilihan'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
