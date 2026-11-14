# MySanad – Malaysia Digital Sanad Directory & Management System

> **Status pembangunan (14 Nov 2026): Fasa 1–8 siap dari segi kod dan ujian; belum digunakan (deployed).**
> Semua ciri dalam spesifikasi telah dibina dan diuji: portal awam, portal guru, sanad & graf, dokumen, semakan pentadbir,
> analitik, data rujukan, tetapan dan tiga bahasa. Ujian: TypeScript, ESLint, 290+ ujian Vitest (termasuk RLS pada Postgres)
> dan 30 ujian E2E Playwright (desktop + mudah alih).
> **Belum disahkan:** semakan langsung terhadap projek Supabase sebenar. Ikut `DEPLOYMENT.md` langkah 7 selepas penggunaan.

**Nama Rasmi:** Malaysia Digital Sanad Directory & Management System  
**Penerangan Bahasa Melayu:** Platform Pendigitalan Profil dan Rangkaian Sanad Guru al-Quran Malaysia.

---

## 1. Visi Projek (Project Vision)
MySanad dibangunkan sebagai platform digital berpusat peringkat kebangsaan untuk mendokumentasikan, mengesahkan, memelihara, dan memaparkan profil guru al-Quran bersanad serta rangkaian transmisi sanad di seluruh Malaysia (13 Negeri & 3 Wilayah Persekutuan).

### PrinsipTeras Integriti Ilmiah
Maklumat yang dihantar oleh pengguna **tidak** dianggap sebagai maklumat ilmiah yang sah secara automatik. Sistem MySanad membezakan secara jelas antara:
1. **Maklumat Dihantar (`submitted`)** – Rekod awal yang diisi oleh guru.
2. **Dokumen Disemak (`documents_reviewed_badge`)** – Sijil ijazah yang telah disahkan ketulenannya oleh Pentadbir Pengesahan.
3. **Jalur Sanad Disemak (`sanad_reviewed_badge`)** – Rantaian perawi (nodes & edges) yang telah ditentusahkan mengikut disiplin ilmu Qiraat.
4. **Maklumat Diluluskan (`approved`)** – Rekod yang lulus semakan.
5. **Maklumat Diterbitkan (`published`)** – Hanya rekod berstatus `published` dan dibenarkan oleh tetapan privasi guru dipaparkan kepada umum.

---

## 2. Ciri-Ciri Utama (Signature Features)
1. **Direktori Guru al-Quran Mengikut Negeri (13 Negeri & 3 Wilayah Persekutuan)**:
   - Dwi-mod paparan: **Peta Interaktif Malaysia (SVG)** (Semenanjung, Sabah, Sarawak & Wilayah Persekutuan) dan **Grid Butang Negeri**.
   - Penapis daerah/jajahan, Qiraat, Riwayat, dan carian nama.
2. **Enjin Carian Nama Guru Bersanad (`Cari Guru al-Quran Bersanad`)**:
   - Menyokong carian penuh/separa, ejaan Rumi, tulisan Arab, ejaan alternatif, institusi, negeri, daerah, Riwayat, dan Qiraat menggunakan indeks PostgreSQL `pg_trgm`.
3. **Profil Guru Beranimasi Premium (`/directory/[teacherId]`)**:
   - Menggunakan **Framer Motion** dengan sokongan `prefers-reduced-motion`.
   - 5 Tab Bersepadu: *Profil*, *Kelayakan & Riwayat*, *Senarai Sanad*, *Graf Sanad*, dan *Institusi / Pengajian*.
4. **Visualisasi Graf Rangkaian Sanad Interaktif (`@xyflow/react`)**:
   - Hierarki transmisi dari Rasulullah SAW → Sahabat → Tabi'in → Imam Qiraat → Perawi → Ulama Klasik → Masyaikh → Guru Malaysia.
   - Fungsi zum, pan, carian nod, sorotan jalur lengkap, kembang/lipat cabang, serta panel perincian biografi & rujukan ilmiah.
5. **Sistem Pengesahan Berpusat & Kawalan Privasi Ketat**:
   - Pengesahan berasingan bagi profil guru, dokumen ijazah, jalur sanad, nod sanad, dan hubungan transmisi.
   - Dokumen sijil disimpan di dalam **Private Supabase Storage** (`private-ijazah-documents`) dan hanya boleh diakses oleh pemilik atau pentadbir melalui *Signed URL* di pelayan.

---

## 3. Tindanan Teknologi (Technology Stack)
- **Frontend:** Next.js 14.2+ (App Router), React 18, TypeScript, Tailwind CSS, shadcn/ui, Lucide React
- **Animasi:** Framer Motion (`framer-motion`)
- **Backend:** Next.js Server Actions, Route Handlers, Zod Validation
- **Pangkalan Data:** Supabase PostgreSQL (20 jadual berstruktur + Row Level Security)
- **Pengesahan & Storan:** Supabase Auth & Supabase Private Storage
- **Visualisasi Graf & Analitik:** React Flow (`@xyflow/react`), Recharts (`recharts`)
- **Pengujian:** Vitest (Unit & Integrasi) + Playwright (E2E)

---

## 4. Struktur Tiga Portal Utama
- **Portal Awam (`/`, `/directory`, `/states/[stateSlug]`, `/sanad/[sanadId]`, `/institutions`)**
- **Portal Guru (`/teacher/dashboard`, `/teacher/profile`, `/teacher/sanad`, `/teacher/ijazah`, `/teacher/documents`, `/teacher/verification`, `/teacher/settings`)**
- **Portal Pentadbir (`/admin/dashboard`, `/admin/teachers`, `/admin/verification`, `/admin/sanad`, `/admin/institutions`, `/admin/reference-data`, `/admin/users`, `/admin/analytics`, `/admin/audit-logs`)**

---

## 5. Arahan Pantas Permulaan (Quick Start)
```bash
npm ci
cp .env.example .env.local     # isi nilai Supabase (lihat DEPLOYMENT.md, langkah 3)
npm run dev                    # http://localhost:3000
```

Semakan penuh sebelum push:
```bash
npm run verify                 # seni bina, TypeScript, ESLint, ujian Vitest, binaan produksi
npm run test:e2e               # Playwright (selepas `npx playwright install chromium`)
```

Dokumentasi:
- `INSTALLATION.md` — pemasangan tempatan dan struktur projek
- `DEPLOYMENT.md` — Supabase, GitHub, Vercel dan semakan selepas penggunaan
- `DATABASE_SCHEMA.md` — skema dan migrasi 001–011
- `SECURITY.md` — kawalan keselamatan dan had yang diketahui
- `API_DOCUMENTATION.md` — laluan HTTP dan fungsi pangkalan data
- `USER_GUIDE.md` — panduan guru, pelawat dan pentadbir (`USER_GUIDE_TEACHER.md`, `USER_GUIDE_ADMIN.md` ialah ringkasan)
