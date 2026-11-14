# Panduan Penggunaan (Deployment) MySanad

Panduan ini membawa MySanad daripada kod sumber kepada laman produksi di **Supabase + GitHub + Vercel**.
Ikut langkah mengikut turutan. Jangan anggap laman telah dilancarkan sehingga langkah 7 (semakan selepas penggunaan) lulus.

---

## 0. Prasyarat
- Node.js 20.9 atau lebih baharu, npm 10+
- Akaun Supabase, GitHub dan Vercel
- Domain (pilihan), contoh `mysanad.my`

## 1. Semakan tempatan
```bash
cp .env.example .env.local     # isi nilai sebenar (langkah 2)
npm ci
npm run verify                 # seni bina, TypeScript, ESLint, 290+ ujian, binaan produksi
npx playwright install chromium
npm run test:e2e               # ujian E2E desktop + mudah alih (memulakan `next start` sendiri)
```
`npm run verify` mesti lulus sepenuhnya sebelum meneruskan.

## 2. Projek Supabase

### 2.1 Cipta projek
- Rantau: **Southeast Asia (Singapore)** — sepadan dengan rantau Vercel `sin1` dalam `vercel.json`.
- Simpan kata laluan pangkalan data dengan selamat.

### 2.2 Jalankan migrasi (mengikut turutan, semuanya wajib)
| Fail | Kandungan |
|---|---|
| `001_initial_schema.sql` | 20 jadual teras, indeks, view awam |
| `002_rls_policies.sql` | RLS asas, bucket dokumen peribadi |
| `003_seed_reference_data.sql` | 16 negeri & WP, daerah, qiraat, riwayat, tariq |
| `004_bootstrap_super_admin.sql` | fungsi lantikan Super Admin pertama |
| `005_security_hardening.sql` | pengerasan keselamatan, audit, had kadar |
| `006_public_directory.sql` | carian, statistik, profil awam |
| `007_teacher_portal.sql` | penghantaran profil, kunci kandungan, permohonan perubahan |
| `008_sanad_management.sql` | rantaian sanad, graf, semakan |
| `009_documents.sql` | pendaftaran dokumen |
| `010_admin_review.sql` | aliran keputusan pentadbir, notifikasi |
| `011_settings_analytics_reference.sql` | tetapan, analitik, data rujukan |

Pilihan A — Supabase CLI:
```bash
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
```
Pilihan B — **SQL Editor**: tampal dan jalankan setiap fail mengikut turutan jadual di atas.

### 2.3 Tetapan Authentication
Dalam **Authentication → URL Configuration**:
- **Site URL**: `https://<domain-anda>`
- **Redirect URLs**: `https://<domain-anda>/auth/callback` (tambah juga URL pratonton Vercel jika perlu, contoh `https://*-<akaun>.vercel.app/auth/callback`)

Dalam **Authentication → Providers → Email**: aktifkan *Confirm email*.
Dalam **Authentication → Rate Limits**: kekalkan had lalai atau ketatkan.

### 2.4 Semak Storage
Migrasi mencipta dua bucket:
- `private-ijazah-documents` — **Private**, 15 MB, PDF/JPEG/PNG/WebP
- `teacher-photos` — Public, 2 MB, JPEG/PNG/WebP

### 2.5 Super Admin pertama
1. Daftar akaun biasa melalui `/register` di laman yang telah digunakan dan sahkan emel.
2. Dalam **SQL Editor** (bukan melalui aplikasi):
   ```sql
   SELECT public.promote_user_to_super_admin('emel-anda@domain');
   ```
   Fungsi ini tidak boleh dipanggil melalui API awam.
3. Lantik Pentadbir Pengesahan lain melalui **Portal Pentadbir → Pengguna & Peranan**.

## 3. Pemboleh ubah persekitaran

| Nama | Wajib | Sulit | Keterangan |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Ya | Tidak | URL projek Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Ya | Tidak | Kunci `anon` (dilindungi oleh RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Ya | **Ya** | Pelayan sahaja. Untuk URL bertandatangan dan had kadar. Tanpanya, produksi menolak permintaan yang dihadkan kadar (fail closed). |
| `MYSANAD_PII_ENCRYPTION_KEY` | Disyorkan | **Ya** | 32 bait base64 untuk penyulitan MyKad. Tanpanya medan MyKad dilumpuhkan. |
| `NEXT_PUBLIC_APP_URL` | Ya | Tidak | URL produksi, contoh `https://mysanad.my` (pautan emel) |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Tidak | Tidak | Ganti emel hubungan jika tetapan sistem kosong |

Jana kunci penyulitan:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
> **Penting:** simpan salinan `MYSANAD_PII_ENCRYPTION_KEY` di tempat selamat (contoh pengurus kata laluan organisasi).
> Kehilangan kunci menjadikan No. MyKad yang disimpan tidak boleh dibaca. Jangan tukar kunci tanpa pelan penyulitan semula.

`NEXT_PUBLIC_SUPABASE_URL` juga digunakan semasa binaan untuk menyempitkan Content-Security-Policy kepada projek anda;
tetapkan ia untuk persekitaran *Build* di Vercel.

## 4. GitHub
```bash
git checkout main
git merge phase-1-foundation          # atau buka Pull Request
git remote add origin https://github.com/<akaun>/mysanad.git
git push -u origin main
```
Fail rahsia (`.env*.local`, `.env`) diabaikan oleh `.gitignore`; sahkan dengan `git status` sebelum push.

CI (`.github/workflows/ci-deploy.yml`) menjalankan semakan seni bina, TypeScript, ESLint, ujian Vitest (termasuk ujian RLS
pada Postgres dalam memori), binaan produksi dan ujian E2E Playwright pada setiap push dan Pull Request. Tiada rahsia diperlukan
untuk CI.

## 5. Vercel
1. **Add New → Project** → import repositori GitHub.
2. Framework: Next.js (dikesan automatik). Rantau fungsi: `sin1` (daripada `vercel.json`).
3. **Settings → Environment Variables**: masukkan semua pemboleh ubah dalam langkah 3 untuk *Production* (dan *Preview*
   jika menggunakan projek Supabase ujian berasingan — disyorkan).
4. **Deploy**.
5. **Settings → Domains**: tambah domain anda dan kemas kini *Site URL* / *Redirect URLs* Supabase (langkah 2.3).

Header keselamatan (CSP, HSTS, X-Frame-Options dan lain-lain) ditetapkan dalam `next.config.mjs`.

## 6. Data demonstrasi (pilihan, bukan produksi)
Untuk projek pembangunan/pratonton sahaja:
```bash
npm run seed:demo -- --yes      # 6 guru rekaan berlabel [DEMO]
npm run seed:demo -- --remove   # padam semuanya
```

## 7. Semakan selepas penggunaan
Lakukan dan rekodkan keputusan setiap langkah:
1. `https://<domain>/` dimuatkan; statistik menunjukkan 0 (bukan angka rekaan) jika tiada guru diterbitkan.
2. Header: `curl -I https://<domain>/` menunjukkan `Content-Security-Policy` dan `Strict-Transport-Security`.
3. Daftar akaun ujian → emel pengesahan diterima → pautan membawa ke `/teacher/dashboard`.
4. Lengkapkan pendaftaran 7 langkah, muat naik foto dan satu dokumen PDF, cipta satu rantaian sanad, hantar.
5. Sebagai pentadbir: *Barisan Semakan* → mula semak → terbitkan profil → luluskan dokumen dan sanad.
6. Profil muncul di `/directory`, `/states/<negeri>`, carian (Rumi dan Arab) dan graf `/sanad`.
7. Pelawat tanpa log masuk mendapat 401 pada `/api/documents/<id>/signed-url`.
8. Tukar bahasa ke عربي — halaman dipaparkan dari kanan ke kiri.
9. Jalankan E2E terhadap laman sebenar:
   ```bash
   E2E_BASE_URL=https://<domain> E2E_WITH_DB=1 npm run test:e2e
   ```

## 8. Operasi
- **Sandaran:** aktifkan *Point-in-Time Recovery* atau sandaran harian Supabase. Simpan kunci penyulitan secara berasingan.
- **Log audit:** *Portal Pentadbir → Log Audit* (Super Admin).
- **Tutup pendaftaran sementara:** *Portal Pentadbir → Tetapan*.
- **Migrasi baharu:** tambah fail `012_*.sql` dan jalankan `npx supabase db push`; jangan ubah migrasi yang telah digunakan.
- **Fail tidak didaftarkan:** muat naik yang tidak selesai mungkin meninggalkan objek tanpa rekod dalam bucket peribadi; semak
  dan bersihkan secara berkala melalui papan pemuka Storage.
