import type { Metadata } from 'next';
import { DraftNotice, ProsePage } from '@/components/public/prose-page';

export const metadata: Metadata = { title: 'Dasar Privasi' };

export default function PrivacyPage() {
  return (
    <ProsePage eyebrow="Privasi" title="Dasar Privasi" description="Bagaimana MySanad mengumpul, menggunakan dan melindungi data peribadi.">
      <DraftNotice />
      <h2>Data yang dikumpul</h2>
      <ul>
        <li>Maklumat akaun: nama, emel dan kata laluan (disimpan dalam bentuk cincang oleh penyedia pengesahan).</li>
        <li>Maklumat profil guru: nama, gelaran, lokasi mengajar, institusi, pendidikan, kelayakan dan rekod sanad.</li>
        <li>Maklumat pengesahan dalaman: nombor kad pengenalan, telefon peribadi dan alamat kediaman.</li>
        <li>Dokumen sokongan seperti sijil ijazah.</li>
      </ul>
      <h2>Apa yang dipaparkan kepada umum</h2>
      <p>
        Hanya maklumat profil yang telah disemak dan diterbitkan, mengikut tetapan keterlihatan yang dipilih oleh guru. Nombor kad
        pengenalan, telefon peribadi, alamat kediaman, dokumen sokongan dan catatan dalaman pentadbir tidak pernah dipaparkan.
      </p>
      <h2>Akses dan keselamatan</h2>
      <ul>
        <li>Dokumen sokongan disimpan secara peribadi dan hanya boleh dilihat oleh guru berkenaan dan pentadbir yang diberi kuasa.</li>
        <li>Setiap perubahan pada rekod sensitif direkodkan dalam log audit.</li>
      </ul>
      <h2>Hak anda</h2>
      <p>
        Selaras dengan Akta Perlindungan Data Peribadi 2010, anda boleh meminta akses, pembetulan atau pemadaman data peribadi anda
        dengan menghubungi pentadbir MySanad.
      </p>
    </ProsePage>
  );
}
