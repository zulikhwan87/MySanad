import type { Metadata } from 'next';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PortalHeader } from '@/components/teacher/portal-header';
import { RecordEditor, type FieldDef } from '@/components/admin/reference/record-editor';
import { DistrictToggle } from '@/components/admin/reference/district-toggle';
import { ReferenceNodeEditor } from '@/components/admin/reference/reference-node-editor';
import { requireAdminPortal } from '@/lib/auth/session';
import { isSuperAdmin } from '@/lib/auth/roles';
import { getReferenceAdminData } from '@/lib/data/reference';
import { saveDistrictAction, saveQiraatAction, saveRiwayatAction, saveTariqAction } from '@/lib/actions/reference-actions';
import { UuidSchema } from '@/lib/validations/search';
import type { SanadNodeInput } from '@/lib/validations/sanad';
import { cn } from '@/lib/utils';

export const metadata: Metadata = { title: 'Data Rujukan' };

const TABS = [
  { key: 'daerah', label: 'Negeri & daerah' },
  { key: 'qiraat', label: 'Qiraat' },
  { key: 'riwayat', label: 'Riwayat' },
  { key: 'tariq', label: 'Tariq' },
  { key: 'perawi', label: 'Perawi rujukan' },
] as const;

const str = (v: unknown) => (v === null || v === undefined ? '' : Array.isArray(v) ? v.join(', ') : String(v));
const toValues = (r: Record<string, unknown>, keys: string[]) => Object.fromEntries([['id', str(r.id)], ...keys.map((k) => [k, str(r[k])])]);

export default async function ReferenceDataPage({ searchParams }: { searchParams: { tab?: string; negeri?: string } }) {
  const me = await requireAdminPortal('/admin/reference-data');
  const superAdmin = isSuperAdmin(me);
  const tab = TABS.find((t) => t.key === searchParams.tab)?.key ?? 'daerah';
  const stateId = UuidSchema.safeParse(searchParams.negeri).success ? searchParams.negeri : undefined;
  const data = await getReferenceAdminData(tab === 'daerah' ? (stateId ?? undefined) : undefined);

  const qiraatFields: FieldDef[] = [
    { name: 'code', label: 'Kod', required: true, hint: 'Contoh: Q05-ASIM' },
    { name: 'display_order', label: 'Susunan', type: 'number', required: true },
    { name: 'imam_name_rumi', label: 'Nama imam (Rumi)', required: true },
    { name: 'imam_name_arabic', label: 'Nama imam (Arab)', type: 'arabic', required: true },
    { name: 'title_rumi', label: 'Tajuk (Rumi)', required: true },
    { name: 'title_arabic', label: 'Tajuk (Arab)', type: 'arabic', required: true },
    { name: 'era_hijri', label: 'Era (Hijrah)' },
    { name: 'region_origin', label: 'Wilayah asal' },
    { name: 'description', label: 'Keterangan', type: 'textarea' },
  ];
  const riwayatFields: FieldDef[] = [
    { name: 'qiraat_id', label: 'Qiraat', type: 'select', required: true, options: data.qiraat.map((q) => ({ value: q.id, label: q.title_rumi })) },
    { name: 'code', label: 'Kod', required: true, hint: 'Contoh: R-HAFS' },
    { name: 'rawi_name_rumi', label: 'Nama perawi (Rumi)', required: true },
    { name: 'rawi_name_arabic', label: 'Nama perawi (Arab)', type: 'arabic', required: true },
    { name: 'full_label_rumi', label: 'Label penuh (Rumi)', required: true },
    { name: 'full_label_arabic', label: 'Label penuh (Arab)', type: 'arabic', required: true },
    { name: 'era_hijri', label: 'Era (Hijrah)' },
    { name: 'display_order', label: 'Susunan', type: 'number', required: true },
    { name: 'description', label: 'Keterangan', type: 'textarea' },
  ];
  const tariqFields: FieldDef[] = [
    { name: 'code', label: 'Kod', required: true, hint: 'Contoh: T-SHATIBIYYAH' },
    { name: 'riwayat_id', label: 'Riwayat (pilihan)', type: 'select', options: data.riwayat.map((r) => ({ value: r.id, label: r.full_label_rumi })) },
    { name: 'name_rumi', label: 'Nama (Rumi)', required: true },
    { name: 'name_arabic', label: 'Nama (Arab)', type: 'arabic', required: true },
    { name: 'source_book_rumi', label: 'Kitab sumber (Rumi)' },
    { name: 'source_book_arabic', label: 'Kitab sumber (Arab)', type: 'arabic' },
    { name: 'description', label: 'Keterangan', type: 'textarea' },
  ];

  return (
    <>
      <PortalHeader
        title="Data Rujukan"
        description="Perubahan direkod dalam log audit. Rekod rujukan tidak dipadam kerana ia dirujuk oleh profil dan sanad; nyahaktifkan sebaliknya."
      />
      <nav aria-label="Jenis data" className="flex flex-wrap gap-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/reference-data?tab=${t.key}`}
            aria-current={tab === t.key ? 'page' : undefined}
            className={cn('rounded-full border px-3 py-1 text-sm', tab === t.key ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-secondary')}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === 'daerah' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Negeri & daerah</CardTitle>
            <CardDescription>16 negeri dan Wilayah Persekutuan adalah tetap. Daerah boleh ditambah, dinamakan semula atau dinyahaktifkan.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="flex gap-2" action="/admin/reference-data">
              <input type="hidden" name="tab" value="daerah" />
              <label htmlFor="ref-state" className="sr-only">
                Negeri
              </label>
              <select id="ref-state" name="negeri" defaultValue={stateId ?? ''} className="h-10 rounded-lg border border-input bg-card px-3 text-sm">
                <option value="">Pilih negeri…</option>
                {data.states.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground">
                Papar
              </button>
            </form>
            {stateId ? (
              <>
                <ul className="divide-y rounded-xl border">
                  {data.districts.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                      <span>
                        {d.name} <span className="font-mono text-xs text-muted-foreground">{d.slug}</span>{' '}
                        {!d.is_active ? <Badge variant="outline">Tidak aktif</Badge> : null}
                      </span>
                      <span className="flex items-center gap-1">
                        <RecordEditor fields={[{ name: 'name', label: 'Nama daerah', required: true }]} initial={{ id: d.id, name: d.name, state_id: d.state_id }} action={saveDistrictAction} />
                        <DistrictToggle id={d.id} active={d.is_active} name={d.name} />
                      </span>
                    </li>
                  ))}
                </ul>
                <RecordEditor fields={[{ name: 'name', label: 'Nama daerah', required: true }]} initial={undefined} action={async (raw) => {
                  'use server';
                  return saveDistrictAction({ ...(raw as object), state_id: stateId });
                }} addLabel="Tambah daerah" />
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {tab === 'qiraat' || tab === 'riwayat' || tab === 'tariq' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{TABS.find((t) => t.key === tab)?.label}</CardTitle>
            <CardDescription>{superAdmin ? 'Hanya Super Admin boleh menambah atau menyunting.' : 'Paparan sahaja. Hanya Super Admin boleh menyunting.'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="divide-y rounded-xl border">
              {(tab === 'qiraat' ? data.qiraat : tab === 'riwayat' ? data.riwayat : data.tariq).map((r) => {
                const fields = tab === 'qiraat' ? qiraatFields : tab === 'riwayat' ? riwayatFields : tariqFields;
                const title = str(r.title_rumi ?? r.full_label_rumi ?? r.name_rumi);
                const arabic = str(r.title_arabic ?? r.full_label_arabic ?? r.name_arabic);
                return (
                  <li key={r.id} className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm">
                    <span>
                      <span className="block font-medium text-forest-900">{title}</span>
                      <span lang="ar" className="arabic block text-forest-700">
                        {arabic}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">{r.code}</span>
                    </span>
                    <RecordEditor
                      fields={fields}
                      initial={toValues(r, fields.map((f) => f.name))}
                      action={tab === 'qiraat' ? saveQiraatAction : tab === 'riwayat' ? saveRiwayatAction : saveTariqAction}
                      readOnly={!superAdmin}
                      editLabel={`Sunting ${title}`}
                    />
                  </li>
                );
              })}
            </ul>
            <RecordEditor
              fields={tab === 'qiraat' ? qiraatFields : tab === 'riwayat' ? riwayatFields : tariqFields}
              action={tab === 'qiraat' ? saveQiraatAction : tab === 'riwayat' ? saveRiwayatAction : saveTariqAction}
              readOnly={!superAdmin}
              addLabel="Tambah"
            />
          </CardContent>
        </Card>
      ) : null}

      {tab === 'perawi' ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Perawi rujukan</CardTitle>
            <CardDescription>
              Perawi klasik yang disahkan oleh pentadbir (contoh: imam qiraat dan perawi). Guru boleh memilihnya secara jelas apabila
              membina rantaian; tiada penggabungan automatik.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="divide-y rounded-xl border">
              {data.nodes.map((n) => (
                <li key={n.id} className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm">
                  <span>
                    <span className="block font-medium text-forest-900">{n.full_name_rumi}</span>
                    {n.full_name_arabic ? (
                      <span lang="ar" className="arabic block text-forest-700">
                        {n.full_name_arabic}
                      </span>
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      <span className="font-mono">{n.canonical_code}</span> · {n.generation_category}
                    </span>
                  </span>
                  <ReferenceNodeEditor
                    initial={{
                      id: n.id,
                      canonical_code: n.canonical_code,
                      node: {
                        full_name_rumi: n.full_name_rumi,
                        full_name_arabic: str(n.full_name_arabic),
                        alternative_spellings: str(n.alternative_spellings),
                        historical_title: str(n.historical_title),
                        generation_category: n.generation_category as SanadNodeInput['generation_category'],
                        birth_year_hijri: str(n.birth_year_hijri),
                        death_year_hijri: str(n.death_year_hijri),
                        birth_year_miladi: str(n.birth_year_miladi),
                        death_year_miladi: str(n.death_year_miladi),
                        country_or_region: str(n.country_or_region),
                        biography: str(n.biography),
                        scholarly_references: Array.isArray(n.scholarly_references) ? (n.scholarly_references as string[]).join('\n') : '',
                      },
                    }}
                  />
                </li>
              ))}
              {data.nodes.length === 0 ? <li className="p-3 text-sm text-muted-foreground">Belum ada perawi rujukan.</li> : null}
            </ul>
            <ReferenceNodeEditor />
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}
