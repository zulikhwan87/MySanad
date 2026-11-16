/**
 * MySanad — Borang Maklumat Guru Sanad al-Quran (Google Form)
 *
 * CARA GUNA
 * 1. Buka https://script.google.com dan log masuk dengan akaun Google anda.
 * 2. Klik "Projek baharu". Padam kandungan sedia ada, kemudian tampal SEMUA kandungan fail ini.
 * 3. Klik ikon Simpan, kemudian pilih fungsi "ciptaBorangGuruSanad" dan klik "Jalankan".
 * 4. Benarkan akses apabila diminta (untuk mencipta borang dan hamparan dalam Drive anda).
 * 5. Buka "Log pelaksanaan" untuk mendapatkan pautan borang, pautan sunting dan hamparan respons.
 *
 * Borang dan hamparan respons disimpan dalam Google Drive anda sahaja.
 *
 * Nota: Google Apps Script tidak boleh mencipta soalan "Muat naik fail". Jika mahu guru memuat naik
 * sijil terus ke borang, buka borang → bahagian "Dokumen" → tambah soalan jenis "Muat naik fail"
 * secara manual (responden perlu log masuk Google).
 */

var NEGERI = [
  'Johor', 'Kedah', 'Kelantan', 'Melaka', 'Negeri Sembilan', 'Pahang', 'Perak', 'Perlis', 'Pulau Pinang',
  'Sabah', 'Sarawak', 'Selangor', 'Terengganu', 'Wilayah Persekutuan Kuala Lumpur',
  'Wilayah Persekutuan Putrajaya', 'Wilayah Persekutuan Labuan',
];

var QIRAAT = [
  "Qiraat Nafi' al-Madani", 'Qiraat Ibn Kathir al-Makki', "Qiraat Abu 'Amr al-Basri", "Qiraat Ibn 'Amir al-Dimashqi",
  "Qiraat 'Asim al-Kufi", 'Qiraat Hamzah al-Kufi', "Qiraat al-Kisa'i al-Kufi", "Qiraat Abu Ja'far al-Madani",
  "Qiraat Ya'qub al-Hadrami", "Qiraat Khalaf al-'Asyir", 'Qiraat Tujuh', 'Qiraat Sepuluh Mutawatirah',
];

var RIWAYAT = [
  "Riwayat Qalun 'an Nafi'", "Riwayat Warsy 'an Nafi'",
  "Riwayat al-Bazzi 'an Ibn Kathir", "Riwayat Qunbul 'an Ibn Kathir",
  "Riwayat al-Duri 'an Abi 'Amr", "Riwayat al-Susi 'an Abi 'Amr",
  "Riwayat Hisyam 'an Ibn 'Amir", "Riwayat Ibn Zakwan 'an Ibn 'Amir",
  "Riwayat Hafs 'an 'Asim", "Riwayat Syu'bah 'an 'Asim",
  "Riwayat Khalaf 'an Hamzah", "Riwayat Khallad 'an Hamzah",
  "Riwayat Abu al-Harith 'an al-Kisa'i", "Riwayat Duri al-Kisa'i",
  "Riwayat Ibn Wardan 'an Abi Ja'far", "Riwayat Ibn Jammaz 'an Abi Ja'far",
  "Riwayat Ruwais 'an Ya'qub", "Riwayat Rauh 'an Ya'qub",
  "Riwayat Ishaq 'an Khalaf al-'Asyir", "Riwayat Idris 'an Khalaf al-'Asyir",
  "Jam'ul Qiraat al-Sab'", "Jam'ul Qiraat al-'Asyar",
  "Jam'ul Qiraat al-'Asyarah al-Sughra", "Jam'ul Qiraat al-'Asyarah al-Kubra",
];

var TARIQ = ['Tariq al-Syatibiyyah', 'Tariq Tayyibat al-Nasyr', 'Tariq al-Durrah al-Mudhiyyah', 'Tidak pasti'];

var KAEDAH = ['Bacaan secara hafazan (ghaiban)', 'Bacaan secara melihat mushaf', 'Bacaan secara dalam talian (online)'];

var TAHAP = [
  'Sijil', 'Diploma', 'Ijazah Sarjana Muda', 'Ijazah Sarjana', 'Doktor Falsafah', 'Pengajian Pondok / Tradisional', 'Lain-lain',
];

var KATEGORI_INSTITUSI = [
  'Universiti Awam', 'Universiti Swasta', 'Maahad Tahfiz', 'Pondok Pengajian', 'Masjid / Pusat Islam', 'Institut Pendidikan',
  'Lain-lain',
];

function ciptaBorangGuruSanad() {
  var form = FormApp.create('Borang Maklumat Guru Sanad al-Quran — MySanad');
  form
    .setDescription(
      'Borang ini mengumpul maklumat guru al-Quran dan sanad mereka untuk didokumenkan dalam MySanad — ' +
        'Direktori dan Digitalisasi Sanad al-Quran Malaysia.\n\n' +
        'Maklumat akan disemak oleh pentadbir MySanad sebelum dipaparkan. Maklumat bertanda "sulit" tidak dipaparkan kepada umum.\n\n' +
        'Borang boleh diisi oleh guru sendiri atau oleh wakil (anak, murid) dengan kebenaran guru.'
    )
    .setProgressBar(true)
    .setAllowResponseEdits(true)
    .setConfirmationMessage(
      'Terima kasih. Maklumat anda telah diterima dan akan disemak oleh pentadbir MySanad. ' +
        'Kami akan menghubungi anda jika memerlukan maklumat lanjut.'
    );

  // --- Pengisi borang ---------------------------------------------------------------------------
  form.addSectionHeaderItem().setTitle('Pengisi borang');
  form
    .addMultipleChoiceItem()
    .setTitle('Siapakah yang mengisi borang ini?')
    .setChoiceValues(['Guru sendiri', 'Wakil guru (dengan kebenaran guru)'])
    .setRequired(true);
  form.addTextItem().setTitle('Nama wakil dan hubungan dengan guru').setHelpText('Isi jika anda wakil. Contoh: Ahmad bin Ali (anak).');

  // --- Maklumat peribadi ---------------------------------------------------------------------------
  form.addPageBreakItem().setTitle('Maklumat peribadi guru');
  form.addTextItem().setTitle('Nama penuh (Rumi)').setRequired(true);
  form.addTextItem().setTitle('Nama penuh (Arab)').setHelpText('Jika ada. Contoh: محمد بن عبد الله');
  form
    .addTextItem()
    .setTitle('Nama paparan awam')
    .setHelpText('Nama yang akan dipaparkan dalam direktori. Contoh: Ustaz Muhammad Abdullah')
    .setRequired(true);
  form.addTextItem().setTitle('Gelaran ilmiah / keagamaan').setHelpText('Contoh: Ustaz, Syeikh, Dr., Hafiz (pilihan)');
  form.addTextItem().setTitle('Ejaan nama alternatif').setHelpText('Ejaan lain nama guru, dipisahkan dengan koma (pilihan)');
  form.addMultipleChoiceItem().setTitle('Jantina').setChoiceValues(['Lelaki', 'Perempuan']).setRequired(true);
  form
    .addTextItem()
    .setTitle('No. MyKad (sulit)')
    .setHelpText('Pilihan. Untuk pengesahan identiti sahaja; tidak dipaparkan kepada umum.')
    .setValidation(
      FormApp.createTextValidation()
        .setHelpText('Format: 880101-03-1234')
        .requireTextMatchesPattern('^[0-9]{6}-?[0-9]{2}-?[0-9]{4}$')
        .build()
    );
  form
    .addTextItem()
    .setTitle('No. telefon (sulit)')
    .setRequired(true)
    .setValidation(
      FormApp.createTextValidation()
        .setHelpText('Contoh: 012-3456789')
        .requireTextMatchesPattern('^\\+?[0-9][0-9 -]{7,15}$')
        .build()
    );
  form
    .addTextItem()
    .setTitle('Emel')
    .setValidation(FormApp.createTextValidation().setHelpText('Masukkan emel yang sah.').requireTextIsEmail().build());
  form.addListItem().setTitle('Negeri kediaman').setChoiceValues(NEGERI);
  form.addTextItem().setTitle('Daerah kediaman');

  // --- Pengajaran ----------------------------------------------------------------------------------
  form.addPageBreakItem().setTitle('Pengajaran');
  form.addListItem().setTitle('Negeri mengajar').setChoiceValues(NEGERI).setRequired(true);
  form.addTextItem().setTitle('Daerah mengajar');
  form.addTextItem().setTitle('Institusi / tempat mengajar').setHelpText('Contoh: Maahad Tahfiz ..., Masjid ..., kelas di rumah');
  form.addListItem().setTitle('Kategori institusi').setChoiceValues(KATEGORI_INSTITUSI);
  form
    .addTextItem()
    .setTitle('Pengalaman mengajar (tahun)')
    .setValidation(FormApp.createTextValidation().setHelpText('Nombor sahaja.').requireNumberBetween(0, 90).build());
  form
    .addCheckboxItem()
    .setTitle('Pengkhususan')
    .setChoiceValues(['Tahsin', 'Tajwid', 'Tahfiz', 'Qiraat', 'Tarannum'])
    .showOtherOption(true);
  form.addMultipleChoiceItem().setTitle('Sedang menerima pelajar baharu?').setChoiceValues(['Ya', 'Tidak']);
  form
    .addParagraphTextItem()
    .setTitle('Biografi ringkas')
    .setHelpText('Latar belakang pengajian dan pengajaran guru (beberapa ayat).')
    .setRequired(true);

  // --- Kelayakan & pendidikan ----------------------------------------------------------------------
  form.addPageBreakItem().setTitle('Kelayakan & pendidikan');
  form.addListItem().setTitle('Qiraat utama').setChoiceValues(QIRAAT);
  form.addListItem().setTitle('Riwayat utama').setChoiceValues(RIWAYAT);
  form.addListItem().setTitle('Tahap pendidikan tertinggi').setChoiceValues(TAHAP);
  form.addTextItem().setTitle('Institusi pendidikan tertinggi');
  form.addTextItem().setTitle('Bidang pengajian');
  form
    .addTextItem()
    .setTitle('Tahun tamat pengajian')
    .setValidation(FormApp.createTextValidation().setHelpText('Contoh: 1998').requireNumberBetween(1900, 2100).build());
  form
    .addParagraphTextItem()
    .setTitle('Pendidikan lain (jika ada)')
    .setHelpText('Satu baris bagi setiap pengajian: tahap, institusi, bidang, tahun. Termasuk pengajian pondok / tradisional.');

  // --- Ijazah sanad ---------------------------------------------------------------------------------
  form
    .addPageBreakItem()
    .setTitle('Ijazah sanad')
    .setHelpText('Isi maklumat ijazah sanad utama. Ijazah lain boleh disenaraikan di soalan terakhir bahagian ini.');
  form.addTextItem().setTitle('Tajuk ijazah').setHelpText("Contoh: Ijazah Sanad Riwayat Hafs 'an 'Asim");
  form.addTextItem().setTitle('Syeikh pemberi ijazah (Rumi)');
  form.addTextItem().setTitle('Syeikh pemberi ijazah (Arab)');
  form.addListItem().setTitle('Qiraat ijazah').setChoiceValues(QIRAAT);
  form.addListItem().setTitle('Riwayat ijazah').setChoiceValues(RIWAYAT);
  form.addListItem().setTitle('Tariq').setChoiceValues(TARIQ);
  form.addMultipleChoiceItem().setTitle('Kaedah pengambilan').setChoiceValues(KAEDAH);
  form.addDateItem().setTitle('Tarikh ijazah').setHelpText('Anggaran jika tidak pasti.');
  form.addTextItem().setTitle('Tempat ijazah').setHelpText('Contoh: Madinah, Kaherah, Kota Bharu');
  form.addMultipleChoiceItem().setTitle('Papar tarikh ijazah kepada umum?').setChoiceValues(['Ya', 'Tidak']);
  form
    .addParagraphTextItem()
    .setTitle('Ijazah sanad lain (jika ada)')
    .setHelpText('Satu baris bagi setiap ijazah: tajuk, syeikh, qiraat/riwayat, tarikh, tempat.');

  // --- Rantaian sanad -------------------------------------------------------------------------------
  form
    .addPageBreakItem()
    .setTitle('Rantaian sanad')
    .setHelpText(
      'Senaraikan nama perawi dalam rantaian sanad. Nama sahaja; gelaran atau kategori tidak diperlukan.'
    );
  form
    .addParagraphTextItem()
    .setTitle('Rantaian sanad (dari guru anda hingga Rasulullah SAW)')
    .setHelpText(
      'Satu nama setiap baris, bermula dengan syeikh yang memberi ijazah kepada guru, kemudian gurunya, dan seterusnya.\n' +
        'Jika ada lebih daripada satu rantaian, pisahkan dengan baris kosong dan tulis tajuknya di atas.'
    );
  form
    .addParagraphTextItem()
    .setTitle('Catatan tambahan tentang sanad')
    .setHelpText('Contoh: cabang rantaian, perawi yang tidak pasti, rujukan kitab.');

  // --- Dokumen --------------------------------------------------------------------------------------
  form
    .addPageBreakItem()
    .setTitle('Dokumen')
    .setHelpText('Sijil ijazah sanad (PDF) dan gambar guru membantu pentadbir menyemak maklumat.');
  form
    .addTextItem()
    .setTitle('Pautan sijil ijazah sanad (PDF)')
    .setHelpText('Muat naik ke Google Drive, tetapkan "Sesiapa yang mempunyai pautan", kemudian tampal pautan di sini.');
  form
    .addTextItem()
    .setTitle('Pautan gambar guru')
    .setHelpText('Gambar berwajah jelas, latar kemas. Muat naik ke Google Drive dan tampal pautan.');
  form
    .addMultipleChoiceItem()
    .setTitle('Benarkan sijil sanad dipaparkan kepada umum dalam profil MySanad?')
    .setHelpText('Sijil hanya dipaparkan selepas disemak dan diluluskan oleh pentadbir.')
    .setChoiceValues(['Ya', 'Tidak']);

  // --- Keterlihatan & pengakuan ---------------------------------------------------------------------
  form.addPageBreakItem().setTitle('Keterlihatan & pengakuan');
  form
    .addCheckboxItem()
    .setTitle('Maklumat yang boleh dipaparkan kepada umum')
    .setHelpText('Nama, negeri, qiraat dan sanad yang diluluskan sentiasa dipaparkan. Tanda yang lain jika dibenarkan.')
    .setChoiceValues(['No. telefon', 'Emel', 'Gambar', 'Institusi mengajar']);
  form
    .addCheckboxItem()
    .setTitle('Persetujuan')
    .setChoiceValues([
      'Saya bersetuju maklumat ini disimpan dan diproses oleh MySanad untuk tujuan direktori dan dokumentasi sanad.',
      'Saya mengesahkan maklumat yang diberikan adalah benar setakat pengetahuan saya.',
    ])
    .setValidation(
      FormApp.createCheckboxValidation()
        .setHelpText('Sila tanda kedua-dua persetujuan.')
        .requireSelectExactly(2)
        .build()
    )
    .setRequired(true);
  form
    .addParagraphTextItem()
    .setTitle('Catatan kepada pentadbir (pilihan)');

  // --- Hamparan respons -----------------------------------------------------------------------------
  var sheet = SpreadsheetApp.create('Respons — Borang Maklumat Guru Sanad al-Quran');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, sheet.getId());

  Logger.log('Borang (kongsi dengan guru): ' + form.getPublishedUrl());
  Logger.log('Sunting borang: ' + form.getEditUrl());
  Logger.log('Hamparan respons: ' + sheet.getUrl());
}
