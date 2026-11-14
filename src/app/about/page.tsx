import type { Metadata } from 'next';
import { ProsePage } from '@/components/public/prose-page';

export const metadata: Metadata = { title: 'Tentang MySanad' };

export default function AboutPage() {
  return (
    <ProsePage eyebrow="Tentang" title="Tentang MySanad" description="Direktori dan platform dokumentasi sanad guru al-Quran Malaysia.">
      <p>
        MySanad membantu guru al-Quran di Malaysia mendokumenkan profil, kelayakan dan jalur sanad mereka secara digital, serta
        membantu masyarakat mencari guru mengikut negeri, daerah, qiraat dan riwayat.
      </p>
      <h2>Apa yang MySanad lakukan</h2>
      <ul>
        <li>Merekod maklumat yang diserahkan oleh guru dalam struktur yang tersusun dan boleh disemak.</li>
        <li>Membolehkan pentadbir menyemak profil, dokumen sokongan dan jalur sanad secara berasingan.</li>
        <li>Memaparkan kepada umum hanya rekod yang telah disemak dan diterbitkan.</li>
      </ul>
      <h2>Apa yang MySanad tidak lakukan</h2>
      <ul>
        <li>MySanad tidak mengisytiharkan kesahihan sesuatu sanad secara automatik.</li>
        <li>MySanad tidak mengeluarkan ijazah, tauliah atau pentauliahan ilmiah.</li>
        <li>MySanad tidak menggabungkan rekod perawi secara automatik berdasarkan persamaan nama.</li>
      </ul>
      <h2>Maksud lencana</h2>
      <ul>
        <li><strong>Profil Disahkan</strong>: maklumat profil telah disemak oleh pentadbir.</li>
        <li><strong>Dokumen Disemak</strong>: dokumen sokongan telah disemak oleh pentadbir.</li>
        <li><strong>Jalur Sanad Disemak</strong>: jalur sanad yang didokumenkan telah disemak oleh pentadbir.</li>
      </ul>
      <p>
        Semakan pentadbir ialah semakan dokumentasi. Penilaian ilmiah terhadap sesuatu sanad kekal menjadi tanggungjawab para
        masyaikh dan institusi yang berautoriti.
      </p>
    </ProsePage>
  );
}
