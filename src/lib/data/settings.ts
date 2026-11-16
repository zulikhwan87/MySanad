import 'server-only';
import { cache } from 'react';
import { createPublicSupabase } from '@/lib/supabase/public';
import { createServerSupabase } from '@/lib/supabase/server';

export interface PublicSettings {
  registration_open: boolean;
  announcement: string;
  contact_email: string | null;
}

const DEFAULTS: PublicSettings = { registration_open: true, announcement: '', contact_email: null };

/** Public settings (anon client). Falls back to safe defaults if the database is unreachable. */
export const getPublicSettings = cache(async (): Promise<PublicSettings> => {
  const supabase = createPublicSupabase();
  if (!supabase) return DEFAULTS;
  const { data, error } = await supabase.from('system_settings').select('key, value');
  if (error || !data) return DEFAULTS;
  const map = Object.fromEntries(data.map((r) => [r.key, r.value]));
  return {
    registration_open: typeof map.registration_open === 'boolean' ? map.registration_open : true,
    announcement: typeof map.announcement === 'string' ? map.announcement : '',
    contact_email: typeof map.contact_email === 'string' ? map.contact_email : null,
  };
});

export interface AdminSettings extends PublicSettings {
  max_documents_per_teacher: number;
  reference_chains_enabled: boolean;
  updated: Record<string, { at: string; by: string | null }>;
}

export async function getAdminSettings(): Promise<AdminSettings> {
  const { data, error } = await createServerSupabase().from('system_settings').select('key, value, updated_at, editor:profiles(full_name)');
  if (error) throw new Error(`[settings] ${error.message}`);
  const rows = (data ?? []) as unknown as Array<{ key: string; value: unknown; updated_at: string; editor: { full_name: string } | null }>;
  const v = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    registration_open: v.registration_open !== false,
    announcement: typeof v.announcement === 'string' ? v.announcement : '',
    contact_email: typeof v.contact_email === 'string' ? v.contact_email : null,
    max_documents_per_teacher: typeof v.max_documents_per_teacher === 'number' ? v.max_documents_per_teacher : 50,
    reference_chains_enabled: v.reference_chains_enabled === true,
    updated: Object.fromEntries(rows.map((r) => [r.key, { at: r.updated_at, by: r.editor?.full_name ?? null }])),
  };
}
