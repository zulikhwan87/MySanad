# API MySanad

Kebanyakan operasi menggunakan **Server Actions** (`src/lib/actions/*`), bukan API REST. Laluan HTTP berikut wujud untuk carian
awam, cadangan dan akses dokumen. Semua respons ralat menggunakan bentuk `{ "error": "<mesej>" }`.

## Awam (tanpa log masuk)

### `GET /api/teachers`
Carian guru yang **diterbitkan sahaja** (sama dengan direktori).

| Parameter | Jenis | Keterangan |
|---|---|---|
| `q` | teks ≤ 100 | Nama Rumi/Arab, ejaan alternatif, institusi, negeri, daerah |
| `negeri` | slug | Contoh `kelantan` |
| `daerah`, `qiraat`, `riwayat`, `institusi` | UUID | Tapisan |
| `halaman` | integer ≥ 1 | 12 rekod setiap halaman |

Parameter tidak sah diabaikan (bukan ralat). Respons:
```json
{ "items": [ { "id": "…", "public_display_name": "…", "state_name": "…", "approved_sanad_count": 1, "…": "…" } ],
  "total": 37, "page": 1, "pageSize": 12, "pageCount": 4 }
```
Tiada IC, telefon, alamat atau catatan dalaman dalam respons. `503` jika Supabase tidak dikonfigurasi.

### `GET /api/search/suggest?q=…`
Sehingga 6 cadangan untuk kotak carian (q ≥ 2 aksara): `{ "suggestions": [ { "id", "name", "arabic", "location" } ] }`.

### `GET /api/states`
Bilangan guru diterbitkan bagi 16 negeri & WP: `{ "states": [ { "slug", "name", "teacher_count", … } ] }`.

### `GET /api/public-documents/{documentId}`
Membuka sijil sanad yang dipaparkan pada profil awam (butang **Papar sanad**). Ubah hala `302` ke pautan bertandatangan
**60 saat**. Hanya sijil yang guru minta dipaparkan, telah diluluskan pentadbir dan milik profil yang diterbitkan.
- `400` ID bukan UUID; `404` untuk semua dokumen lain (respons sama); `429` melebihi 30 permintaan/minit setiap IP;
  `503` jika `SUPABASE_SERVICE_ROLE_KEY` tiada.

## Berpengesahan

### `GET /api/documents/{documentId}/signed-url[?muat-turun=1]`
Pautan bertandatangan **60 saat** ke dokumen peribadi.
- `401` tanpa log masuk; `400` ID bukan UUID; `429` melebihi 60 permintaan/minit.
- `404` jika dokumen tiada **atau** bukan milik anda (RLS: pemilik atau pentadbir sahaja) — respons sama untuk kedua-dua kes.
- `?muat-turun=1` memaksa muat turun dengan nama fail asal.
- Setiap akses direkod dalam log audit. Respons: `Cache-Control: no-store`, `Referrer-Policy: no-referrer`.

```json
{ "signedUrl": "https://…supabase.co/storage/v1/object/sign/…", "expiresInSeconds": 60 }
```

### `GET /auth/callback`
Pautan pengesahan emel dan tetapan semula kata laluan Supabase (`code` atau `token_hash` + `type`), kemudian ubah hala ke
`next` yang selamat (laluan dalaman sahaja).

## Fungsi pangkalan data (RPC)
Dipanggil oleh pelayan melalui klien Supabase; RLS dan semakan peranan berlaku dalam pangkalan data.

| Fungsi | Pemanggil | Keterangan |
|---|---|---|
| `search_public_teachers`, `get_public_teacher_profile`, `get_public_sanad_graph`, `public_platform_stats`, `public_qiraat_riwayat_stats`, `get_public_sanad_documents` | Awam | Data awam sahaja |
| `submit_my_teacher_profile`, `withdraw_my_teacher_submission` | Guru | Penghantaran profil atomik |
| `ensure_my_sanad_node`, `submit_my_sanad_chain`, `withdraw_my_sanad_chain`, `revise_my_sanad_chain`, `search_linkable_sanad_nodes` | Guru | Sanad |
| `register_my_document`, `delete_my_document`, `set_my_document_public` | Guru | Dokumen; paparan awam sijil sanad |
| `admin_start_review`, `admin_decide_submission`, `admin_decide_change_request`, `admin_set_publication`, `admin_set_featured`, `admin_set_item_status`, `admin_get_teacher_ic_ciphertext`, `admin_dashboard_counts`, `admin_analytics` | Pentadbir | Semakan & pengurusan |
| `consume_rate_limit`, `public_sanad_document_path` | Service role | Had kadar; laluan storan sijil awam |
| `promote_user_to_super_admin` | SQL Editor sahaja | Lantikan pertama |

Butiran setiap fungsi: `DATABASE_SCHEMA.md`.
