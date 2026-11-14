import 'server-only';
import { createServerSupabase } from '@/lib/supabase/server';

export async function getReferenceAdminData(stateId?: string) {
  const s = createServerSupabase();
  const [states, districts, qiraat, riwayat, tariq, nodes] = await Promise.all([
    s.from('malaysian_states').select('id, name, slug, is_federal_territory').order('display_order'),
    stateId
      ? s.from('malaysian_districts').select('id, name, slug, is_active, state_id').eq('state_id', stateId).order('name')
      : Promise.resolve({ data: [], error: null }),
    s.from('qiraat_types').select('*').order('display_order'),
    s.from('riwayat_types').select('*').order('display_order'),
    s.from('tariq_types').select('*').order('name_rumi'),
    s
      .from('sanad_nodes')
      .select('id, canonical_code, full_name_rumi, full_name_arabic, alternative_spellings, historical_title, generation_category, birth_year_hijri, death_year_hijri, birth_year_miladi, death_year_miladi, country_or_region, biography, scholarly_references, verification_status')
      .not('canonical_code', 'is', null)
      .order('canonical_code'),
  ]);
  for (const r of [states, districts, qiraat, riwayat, tariq, nodes]) if (r.error) throw new Error(`[reference] ${r.error.message}`);
  return {
    states: (states.data ?? []) as Array<{ id: string; name: string; slug: string; is_federal_territory: boolean }>,
    districts: (districts.data ?? []) as Array<{ id: string; name: string; slug: string; is_active: boolean; state_id: string }>,
    qiraat: (qiraat.data ?? []) as Array<Record<string, unknown> & { id: string; code: string; title_rumi: string; title_arabic: string }>,
    riwayat: (riwayat.data ?? []) as Array<Record<string, unknown> & { id: string; code: string; qiraat_id: string; full_label_rumi: string; full_label_arabic: string }>,
    tariq: (tariq.data ?? []) as Array<Record<string, unknown> & { id: string; code: string; name_rumi: string; name_arabic: string }>,
    nodes: (nodes.data ?? []) as Array<Record<string, unknown> & { id: string; canonical_code: string; full_name_rumi: string; full_name_arabic: string | null; generation_category: string }>,
  };
}
