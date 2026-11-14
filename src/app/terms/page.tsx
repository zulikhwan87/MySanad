import type { Metadata } from 'next';
import { DraftNotice, ProsePage } from '@/components/public/prose-page';

export const metadata: Metadata = { title: 'Terma Penggunaan' };

export default function TermsPage() {
  return (
    <ProsePage eyebrow="Terma" title="Terma Penggunaan">
      <DraftNotice />
      <h2>Sifat maklumat</h2>
      <p>
        Maklumat dalam MySanad diserahkan oleh guru dan disemak oleh pentadbir sebagai dokumentasi. Ia bukan pengisytiharan
        kesahihan sanad dan bukan pentauliahan ilmiah.
      </p>
      <h2>Tanggungjawab guru</h2>
      <ul>
        <li>Memastikan maklumat yang diserahkan adalah benar dan tepat.</li>
        <li>Tidak memuat naik dokumen milik orang lain tanpa kebenaran.</li>
        <li>Mengemas kini maklumat apabila berlaku perubahan.</li>
      </ul>
      <h2>Penggunaan yang dilarang</h2>
      <ul>
        <li>Mengumpul data guru secara automatik atau besar-besaran.</li>
        <li>Menyamar sebagai guru atau pentadbir.</li>
        <li>Cubaan memintas kawalan keselamatan platform.</li>
      </ul>
      <h2>Penggantungan</h2>
      <p>Pentadbir boleh menggantung rekod atau akaun yang melanggar terma ini.</p>
    </ProsePage>
  );
}
