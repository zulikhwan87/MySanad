# Pemasangan Tempatan MySanad

## Keperluan
- Node.js **20.9+** dan npm 10+
- Projek Supabase (untuk data sebenar). Tanpanya aplikasi tetap berjalan dan memaparkan "Pangkalan data belum disambungkan".
- Docker **tidak** diperlukan: ujian pangkalan data menggunakan PGlite (Postgres dalam memori).

## Langkah
```bash
npm ci
cp .env.example .env.local
```
Isi `.env.local` (lihat jadual pemboleh ubah dalam `DEPLOYMENT.md`, langkah 3), kemudian jalankan semua migrasi dalam
`supabase/migrations/` mengikut turutan pada projek Supabase pembangunan anda (`npx supabase db push` atau SQL Editor).

Dalam Supabase **Authentication → URL Configuration**, tambah `http://localhost:3000/auth/callback` sebagai Redirect URL.

```bash
npm run dev            # http://localhost:3000
```

## Arahan berguna
| Arahan | Fungsi |
|---|---|
| `npm run dev` | Pelayan pembangunan |
| `npm run typecheck` | Semakan TypeScript (strict) |
| `npm run lint` | ESLint |
| `npm run test` | Ujian unit, komponen dan pangkalan data (RLS) — Vitest + PGlite |
| `npm run build` / `npm start` | Binaan dan pelayan produksi |
| `npm run test:e2e` | Playwright desktop + mudah alih (perlukan `npm run build` dan `npx playwright install chromium`) |
| `npm run verify` | Semua semakan di atas kecuali E2E |
| `npm run seed:demo -- --yes` | Data demonstrasi rekaan (projek pembangunan sahaja) |
| `npm run seed:demo -- --remove` | Padam data demonstrasi |

## Super Admin pertama (pembangunan)
Daftar melalui `/register`, sahkan emel, kemudian dalam SQL Editor:
```sql
SELECT public.promote_user_to_super_admin('emel-anda@domain');
```

## Struktur projek
```
src/app/                 Laluan App Router (awam, /teacher, /admin, /api)
src/components/          Komponen UI (ui, public, profile, sanad, teacher, admin, documents)
src/lib/actions/         Server Actions (semua mutasi; Zod + semakan peranan)
src/lib/data/            Bacaan data pelayan (sesi pengguna atau klien awam tanpa kuki)
src/lib/validations/     Skema Zod
src/lib/i18n/            Kamus BM/EN/AR, penukar bahasa
src/lib/sanad/           Susun atur dan utiliti graf
supabase/migrations/     001–015 (skema, RLS, fungsi, data rujukan)
tests/unit, components   Vitest (jsdom untuk komponen)
tests/db                 Ujian RLS & fungsi pada PGlite
tests/e2e                Playwright
```

## Masalah biasa
- **"Pangkalan data belum disambungkan"**: `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` tiada.
- **Pautan emel ke localhost:3000 tidak berfungsi di produksi**: tetapkan `NEXT_PUBLIC_APP_URL`.
- **Medan MyKad dilumpuhkan**: `MYSANAD_PII_ENCRYPTION_KEY` tiada.
- **"Terlalu banyak permintaan" di produksi**: `SUPABASE_SERVICE_ROLE_KEY` tiada (had kadar gagal tertutup).
