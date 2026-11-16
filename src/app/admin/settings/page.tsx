import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PortalHeader } from '@/components/teacher/portal-header';
import { SettingsForm } from '@/components/admin/settings-form';
import { fmtDate } from '@/components/admin/labels';
import { requireAdminPortal } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/roles';
import { getAdminSettings } from '@/lib/data/settings';
import { isPiiEncryptionConfigured } from '@/lib/crypto/pii';
import { isServiceRoleConfigured } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Tetapan Sistem' };

export default async function SettingsPage() {
  const me = await requireAdminPortal('/admin/settings');
  const s = await getAdminSettings();
  const lastChange = Object.values(s.updated).sort((a, b) => b.at.localeCompare(a.at))[0];
  const checks = [
    { label: 'Kunci service role (pelayan)', ok: isServiceRoleConfigured(), note: 'Diperlukan untuk URL bertandatangan dan had kadar.' },
    { label: 'Kunci penyulitan MyKad', ok: isPiiEncryptionConfigured(), note: 'Tanpanya, medan MyKad dilumpuhkan.' },
    { label: 'URL aplikasi (pautan emel)', ok: Boolean(process.env.NEXT_PUBLIC_APP_URL), note: 'NEXT_PUBLIC_APP_URL' },
  ];
  return (
    <>
      <PortalHeader
        title="Tetapan Sistem"
        description={lastChange ? `Kemas kini terakhir ${fmtDate(lastChange.at, true)}${lastChange.by ? ` oleh ${lastChange.by}` : ''}.` : undefined}
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tetapan platform</CardTitle>
          <CardDescription>Disahkan oleh pangkalan data dan direkod dalam log audit.</CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm
            editable={isSuperAdmin(me)}
            initial={{
              registration_open: s.registration_open,
              announcement: s.announcement,
              contact_email: s.contact_email ?? '',
              max_documents_per_teacher: s.max_documents_per_teacher,
              reference_chains_enabled: s.reference_chains_enabled,
            }}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Konfigurasi pelayan</CardTitle>
          <CardDescription>Ditetapkan melalui pemboleh ubah persekitaran; nilai rahsia tidak dipaparkan.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y text-sm">
            {checks.map((c) => (
              <li key={c.label} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {c.label} <span className="text-xs text-muted-foreground">· {c.note}</span>
                </span>
                <span className={c.ok ? 'font-medium text-emerald-700' : 'font-medium text-red-700'}>{c.ok ? '✓ Dikonfigurasi' : '✕ Tiada'}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
