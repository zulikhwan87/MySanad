# Keselamatan MySanad (SECURITY.md)

Dokumen ini menerangkan kawalan keselamatan yang **benar-benar dilaksanakan dan diuji** setakat Fasa 1.
Ujian berkaitan: `tests/db/rls.test.ts` (39 ujian pangkalan data) dan `tests/unit/auth.test.ts`.

## 1. Prinsip
1. **Pangkalan data ialah penjaga utama.** Row Level Security (RLS) dan trigger pengawal menguatkuasakan akses, walaupun kod aplikasi tersilap.
2. **Pelawat awam tidak membaca jadual asas.** Data awam hanya melalui view `v_public_teachers` dan `v_public_sanad_chains`, yang memilih lajur selamat sahaja.
3. **Guru tidak boleh mengesahkan atau menerbitkan rekod sendiri.** Lajur status, penerbitan, lencana dan penyemak hanya boleh diubah oleh pentadbir atau peranan backend dipercayai.
4. **Kunci service role hanya di pelayan.** `src/lib/supabase/server.ts` mengimport `server-only`, jadi sebarang import dari komponen klien gagal semasa binaan.

## 2. Peranan
| Peranan | Akses |
|---|---|
| `super_admin` | Semua, termasuk menukar peranan / status akaun pengguna lain dan membaca `audit_logs`. Tidak boleh menukar peranan sendiri (elak terkunci). |
| `verification_admin` | Semak dan ubah status profil, dokumen, sanad, nod dan hubungan. Tidak boleh menukar peranan. |
| `registered_teacher` | Rekod milik sendiri sahaja. Boleh menukar status `draft ⇄ submitted` dan `revision_required → submitted/draft` sahaja. |
| Pelawat awam (`anon`) | Data rujukan, view awam, dan rekod `approved/published` yang ditanda awam milik guru yang diterbitkan. |

Peranan sentiasa ditetapkan `registered_teacher` semasa pendaftaran oleh trigger `handle_new_auth_user`. Metadata pendaftaran tidak boleh menetapkan peranan.

Super Admin pertama dilantik melalui SQL Editor Supabase sahaja:
```sql
SELECT public.promote_user_to_super_admin('emel@anda');
```
Fungsi ini **tidak boleh** dipanggil oleh `anon` atau `authenticated` (migrasi 005).

## 3. Data peribadi
Tidak pernah didedahkan kepada umum: `ic_number_encrypted`, `private_phone`, `residential_address`, `sanad_chains.internal_notes`, `verification_reviews.internal_admin_comment`, metadata dan fail dokumen sokongan.
Log audit membuang lajur IC, telefon dan alamat sebelum disimpan.

## 4. Storan
| Bucket | Awam | Had | Laluan |
|---|---|---|---|
| `private-ijazah-documents` | Tidak | 15 MB; PDF, JPEG, PNG, WebP | `<auth.uid()>/...` |
| `teacher-photos` | Ya (URL awam) | 2 MB; JPEG, PNG, WebP | `<auth.uid()>/...` |

- Dokumen peribadi hanya dibaca melalui `/api/documents/[documentId]/signed-url`: perlu log masuk, ID disahkan UUID, akses disemak oleh RLS (jawapan 404 yang sama untuk "tiada" dan "bukan milik anda"), URL tamat dalam 60 saat, setiap pengeluaran direkod dalam log audit.
- Nota: foto dalam `teacher-photos` boleh dicapai sesiapa yang mengetahui URL, termasuk sebelum profil diterbitkan.

## 5. Log audit
Trigger `audit_row_change` merekod setiap INSERT/UPDATE/DELETE pada jadual sensitif. `audit_logs` adalah tambah-sahaja: UPDATE, DELETE dan TRUNCATE ditarik balik daripada `anon`, `authenticated` dan `service_role`. Peristiwa aplikasi direkod melalui `log_audit_event()` dengan pelaku sentiasa `auth.uid()`.

## 6. Pengesahan & sesi
- Sesi Supabase dalam kuki httpOnly melalui `@supabase/ssr`; middleware menyegarkan sesi pada setiap permintaan.
- Keputusan akses menggunakan `auth.getUser()` (disahkan oleh Supabase Auth), bukan kandungan kuki semata-mata.
- Portal `/teacher` dan `/admin` disemak tiga lapis: middleware, layout pelayan, dan RLS. Jika Supabase tidak dikonfigurasi, portal ditutup.
- Pautan `next` selepas log masuk ditapis oleh `safeRedirectPath` (elak open redirect).
- Mesej ralat log masuk, pendaftaran dan lupa kata laluan tidak mendedahkan sama ada emel wujud.
- Kata laluan: minimum 10 aksara, mengandungi huruf dan nombor.

## 7. Had kadar (rate limiting)
Fungsi `consume_rate_limit()` (service role sahaja) melaksanakan tetingkap tetap secara atomik dalam Postgres.

| Tindakan | Had |
|---|---|
| Log masuk | 10 / 15 minit setiap IP dan setiap emel |
| Pendaftaran | 5 / jam setiap IP |
| Lupa kata laluan | 5 / jam setiap IP dan setiap emel |
| URL bertandatangan | 60 / minit setiap pengguna |

Dalam produksi, ketiadaan `SUPABASE_SERVICE_ROLE_KEY` menyebabkan permintaan ditolak (fail closed).

## 7a. Portal awam (Fasa 2)
- Halaman awam membaca data dengan klien anonim tanpa kuki (`src/lib/supabase/public.ts`). Pentadbir yang log masuk melihat halaman awam sama seperti pelawat.
- Carian melalui `search_public_teachers()` sahaja; input dihadkan 100 aksara dan had halaman diapit 1–50.
- Parameter URL disahkan dengan Zod; nilai tidak sah dibuang, bukan dihantar ke pangkalan data.
- Foto guru hanya dipaparkan jika URL datang daripada bucket `teacher-photos` MySanad (elak penjejakan oleh URL luar).
- Pautan hubungan dan laman web institusi hanya `http(s)`, `mailto:` atau `tel:`, dengan `rel="nofollow noopener noreferrer"`.
- Profil tidak wujud dan profil belum diterbitkan memberi respons 404 yang sama.

## 7b. Portal guru (Fasa 3)
- **No. MyKad disulitkan** dengan AES-256-GCM (`src/lib/crypto/pii.ts`) menggunakan `MYSANAD_PII_ENCRYPTION_KEY` (pelayan sahaja). Hanya 4 digit terakhir dipaparkan kepada guru. Nilai yang diusik dikesan oleh tag pengesahan.
- **Integriti maklumat disahkan**: status profil hanya berubah melalui fungsi penghantaran atau keputusan pentadbir. Profil diterbitkan dikunci; perubahan melalui `teacher_change_requests`.
- **Foto**: dimuat naik terus ke folder pemilik (RLS storan), kemudian disahkan oleh pelayan melalui bait tandatangan fail (JPEG/PNG/WebP sahaja, ≤ 2 MB). Fail tidak sah dipadam.
- Semua tindakan guru disahkan dengan Zod, menyemak kesepadanan negeri–daerah dan qiraat–riwayat, dihadkan kadar (60/minit), dan menapis mengikut `teacher_id` sebagai pertahanan tambahan kepada RLS.

## 7c. Sanad (Fasa 4)
- Graf awam hanya mengandungi hubungan `approved/published` + `is_public` antara perawi yang juga disahkan, dalam rantaian awam guru yang diterbitkan, dan menghormati tetapan `show_sanad_graph`.
- Bukti sokongan dan catatan hubungan adalah sulit: tidak pernah dikembalikan oleh `get_public_sanad_graph` dan dibuang daripada eksport awam.
- Guru hanya boleh menyambung perawi yang disahkan atau yang mereka cipta sendiri (`can_use_sanad_node`), dan tidak boleh menyunting perawi milik orang lain.
- Eksport graf awam hanya jika guru dan rantaian kedua-duanya membenarkan; setiap eksport PNG/JSON mengandungi penafian dokumentasi.
- Nama serupa tidak pernah digabungkan secara automatik; guru mesti memilih secara jelas.

## 7d. Dokumen (Fasa 5)
- Fail dimuat naik terus ke bucket peribadi dalam folder pemilik dengan nama rawak (nama asal tidak digunakan dalam laluan).
- Pelayan membaca 16 bait pertama sahaja dan menentukan jenis daripada kandungan (PDF/JPEG/PNG/WebP). Jenis MIME yang didaftarkan datang daripada kandungan, bukan pelayar. Fail yang tidak sah, tidak sepadan dengan sambungan, atau ditolak oleh pangkalan data dipadam serta-merta.
- Pangkalan data mengesahkan saiz terhadap metadata storan, pemilikan rekod yang dikaitkan (IDOR) dan had bilangan dokumen.
- Paparan/muat turun melalui URL bertandatangan 60 saat; RLS menentukan akses (404 yang sama untuk "tiada" dan "bukan milik anda"); setiap akses direkod dalam log audit; respons `no-store` + `no-referrer`.
- **Had diketahui:** tiada imbasan perisian hasad; metadata EXIF imej tidak dibuang (fail peribadi, dilihat pentadbir sahaja); objek yang dimuat naik tetapi tidak didaftarkan (contoh: pelayar ditutup) kekal sehingga pembersihan berkala dilaksanakan.

## 7e. Portal pentadbir (Fasa 6)
- Akses berlapis: middleware, layout pelayan, semakan peranan dalam setiap tindakan, dan `require_admin()` dalam setiap fungsi pangkalan data.
- Halaman *Pengguna & Peranan* dan *Log Audit* untuk Super Admin sahaja (layout + RLS). Super Admin tidak boleh menukar peranan atau status akaun sendiri.
- Catatan dalaman penyemak disimpan dalam `verification_reviews` (pentadbir sahaja); guru hanya menerima ulasan awam.
- No. MyKad penuh dipaparkan hanya selepas sebab dinyatakan; pangkalan data menulis log audit dahulu, nyahsulit berlaku di pelayan; had 10 paparan sejam bagi setiap pentadbir.
- Tindakan pentadbir dihadkan kadar (120/minit).

## 7f. Tetapan & bahasa (Fasa 7)
- Tetapan sistem hanya boleh diubah oleh Super Admin; nilai disahkan oleh pangkalan data dan direkod dalam log audit.
- Penutupan pendaftaran dikuatkuasakan dalam trigger `auth.users`, bukan sahaja dalam borang.
- Kuki bahasa (`mysanad_locale`) hanya menerima `ms`/`en`/`ar`; nilai lain diabaikan.

## 8. Header HTTP
- **Content-Security-Policy**: `default-src 'self'`; skrip dan gaya daripada laman sendiri (`'unsafe-inline'` diperlukan oleh skrip permulaan Next.js; `'unsafe-eval'` hanya dalam pembangunan); imej dan sambungan hanya ke projek Supabase yang dikonfigurasi; `frame-ancestors 'none'`, `object-src 'none'`, `form-action 'self'`, `upgrade-insecure-requests` dalam produksi.
- `Strict-Transport-Security`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`; pengepala `X-Powered-By` dimatikan.

## 9. Isu diketahui (belum selesai)
- CSP masih membenarkan `'unsafe-inline'` untuk skrip (keperluan Next.js tanpa nonce). Peralihan kepada nonce memerlukan semua halaman dijana secara dinamik.

## 10. Melaporkan isu keselamatan
Laporkan secara peribadi kepada pentadbir projek. Jangan buka isu awam untuk kelemahan keselamatan.
