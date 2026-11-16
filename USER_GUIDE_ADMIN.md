# Panduan Pentadbir (ringkas)

Panduan penuh dan terkini: **[USER_GUIDE.md](USER_GUIDE.md)** (bahagian *Untuk pentadbir*) dan **[SECURITY.md](SECURITY.md)**.

Ringkasan tugas pentadbir:

1. **Barisan Semakan** (`/admin/verification`): mula semak (mengunci rekod daripada disunting guru), semak profil, dokumen
   (pautan 60 saat) dan graf sanad, kemudian lulus / terbit / minta pembetulan / tolak. Ulasan kepada guru wajib untuk
   tolak dan pembetulan; catatan dalaman tidak pernah dilihat oleh guru.
2. **Keputusan per-item**: pendidikan, ijazah, saluran hubungan, perawi dan hubungan sanad boleh diputuskan secara berasingan.
3. **Permohonan perubahan**: bandingkan nilai semasa dan dicadangkan sebelum meluluskan.
4. **Guru**: terbit, tarik balik, gantung (sebab wajib), pulihkan, jadikan pilihan.
5. **Data Rujukan** dan **Institusi**: daerah, perawi rujukan klasik, pengesahan institusi.
6. **Super Admin sahaja**: *Pengguna & Peranan*, *Log Audit*, *Tetapan* sistem.
7. No. MyKad penuh hanya boleh dipaparkan selepas sebab dinyatakan; setiap paparan direkod dalam log audit.

Lencana *Dokumen Disemak* dan *Jalur Sanad Disemak* dikemas kini secara automatik berdasarkan rekod yang diluluskan.

## Memasukkan data bagi pihak guru
Untuk guru yang tidak dapat mendaftar sendiri (contohnya warga emas):
1. **Pengurusan Guru → Tambah guru**: isi nama dan maklumat peribadi. Profil dicipta tanpa akaun atau emel dan ditanda
   *Diurus pentadbir*.
2. Di halaman **Sunting data guru**, lengkapkan bahagian *Kelayakan & ijazah*, *Pengajaran*, *Gambar*, *Dokumen*
   (termasuk Sijil Ijazah Sanad untuk butang Papar Sanad), *Sanad* dan *Keterlihatan*.
3. **Hantar & akaun → Hantar untuk pengesahan**, kemudian di **Barisan Semakan** terbitkan profil dan luluskan sanad serta
   dokumen.
4. Jika guru atau keluarganya mendaftar akaun kemudian, gunakan **Pautkan kepada akaun** supaya mereka boleh mengurus
   profil sendiri.

Pentadbir juga boleh menyunting profil guru yang mendaftar sendiri melalui **Sunting data guru**. Perubahan disimpan terus,
direkod dalam log audit, dan guru menerima notifikasi (sekali setiap 30 minit). Masukkan data hanya dengan kebenaran guru.

## Rantaian rujukan

Portal Pentadbir → **Rantaian Rujukan**. Bahagian atas sanad yang lazim (contohnya dari seorang syeikh hingga Rasulullah SAW)
disediakan sekali oleh pentadbir supaya guru tidak perlu menaipnya semula.

1. **Cipta rantaian rujukan** (pilih perawi permulaan, kemudian tambah guru-gurunya ke atas satu demi satu), atau
   **Salin daripada rantaian yang diluluskan** (bahagian dari perawi yang dipilih hingga ke atas disalin sebagai draf).
2. Semak **Senarai semakan perawi** satu demi satu. Betulkan, ganti atau buang perawi dalam graf jika perlu.
3. Klik **Saya telah menyemak — Aktifkan**. Hanya rantaian aktif kelihatan kepada guru.
4. Untuk menyunting rantaian aktif, klik **Nyahaktifkan untuk menyunting**, buat pembetulan, kemudian aktifkan semula.
5. **Padam** rantaian yang tidak aktif bila-bila masa.

Guru menyalin bahagian yang diperlukan ke dalam rantaian mereka; salinan itu disemak bersama rantaian guru di Barisan Semakan.
Menyunting, menyahaktifkan atau memadam rantaian rujukan **tidak** mengubah rantaian guru yang sudah menyalinnya.

Untuk mematikan fungsi ini sepenuhnya: **Tetapan** → nyahtanda **Rantaian rujukan untuk guru**.
