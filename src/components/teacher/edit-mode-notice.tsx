import Link from 'next/link';
import { Lock, Send } from 'lucide-react';
import { Alert } from '@/components/ui/alert';
import type { ProfileEditMode } from '@/lib/teacher/status';

export function EditModeNotice({ mode }: { mode: ProfileEditMode }) {
  if (mode === 'editable') return null;
  if (mode === 'change-request') {
    return (
      <Alert variant="info" className="flex gap-3">
        <Send className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          Profil anda telah diterbitkan. Perubahan pada maklumat awam dihantar sebagai{' '}
          <Link href="/teacher/profile#permohonan" className="font-medium underline">
            permohonan perubahan
          </Link>{' '}
          dan hanya dipaparkan selepas diluluskan.
        </span>
      </Alert>
    );
  }
  return (
    <Alert variant="default" className="flex gap-3">
      <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>Profil anda sedang disemak atau telah dimuktamadkan. Maklumat awam tidak boleh disunting buat masa ini.</span>
    </Alert>
  );
}
