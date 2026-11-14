'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { setUserActiveAction, setUserRoleAction } from '@/lib/actions/admin-actions';
import { ROLE_LABELS } from '@/lib/auth/roles';
import { ASSIGNABLE_ROLES } from '@/lib/validations/admin';
import type { UserRole } from '@/types/mysanad';

export function UserRowActions({ userId, role, active, isSelf }: { userId: string; role: UserRole; active: boolean; isSelf: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    startTransition(async () => {
      const res = await fn();
      if (res.ok) router.refresh();
      else window.alert(res.message);
    });
  if (isSelf) return <span className="text-xs text-muted-foreground">Akaun anda</span>;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <label htmlFor={`role-${userId}`} className="sr-only">
        Peranan
      </label>
      <select
        id={`role-${userId}`}
        className="h-9 rounded-lg border border-input bg-card px-2 text-sm"
        value={role}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value as UserRole;
          if (window.confirm(`Tukar peranan kepada "${ROLE_LABELS[next]}"?`)) run(() => setUserRoleAction({ user_id: userId, role: next }));
          else e.target.value = role;
        }}
      >
        {ASSIGNABLE_ROLES.map((r) => (
          <option key={r} value={r}>
            {ROLE_LABELS[r]}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        variant={active ? 'ghost' : 'outline'}
        disabled={pending}
        onClick={() => window.confirm(active ? 'Nyahaktifkan akaun ini?' : 'Aktifkan semula akaun ini?') && run(() => setUserActiveAction({ user_id: userId, active: !active }))}
      >
        {active ? 'Nyahaktif' : 'Aktifkan'}
      </Button>
    </span>
  );
}
