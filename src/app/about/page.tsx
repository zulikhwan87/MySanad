import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpenCheck, FileCheck2, Search, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProsePage } from '@/components/public/prose-page';

export const metadata: Metadata = {
  title: 'Tentang MySanad',
  description: 'Apa itu MySanad, bagaimana sanad didokumenkan dan disemak, dan apa maksud lencana pada profil guru.',
};

const STEPS = [
  { title: 'Daftar dan lengkapkan profil', body: 'Guru mendaftar akaun dan mengisi maklumat peribadi, kelayakan, ijazah dan tempat mengajar.' },
  {
    title: 'Bina rantaian sanad',
    body: 'Guru memasukkan nama perawi bermula daripada syeikh yang memberi ijazah, naik ke atas hingga ke sumber yang didokumenkan.',
  },
  { title: 'Muat naik sijil', body: 'Sijil ijazah sanad (PDF) dimuat naik sebagai dokumen sokongan untuk semakan pentadbir.' },
  {
    title: 'Semakan pentadbir',
    body: 'Pentadbir menyemak profil, dokumen dan setiap hubungan dalam rantaian. Jika ada kesilapan, guru diminta membetulkannya.',
  },
  { title: 'Diterbitkan', body: 'Hanya rekod yang telah disemak dipaparkan dalam direktori awam.' },
];

const AUDIENCE = [
  { icon: Search, title: 'Masyarakat', body: 'Mencari guru al-Quran mengikut negeri, daerah, qiraat dan riwayat.' },
  { icon: Users, title: 'Guru al-Quran', body: 'Mendokumenkan profil dan jalur sanad secara digital supaya terpelihara dan mudah dirujuk.' },
  { icon: BookOpenCheck, title: 'Penuntut ilmu', body: 'Mengenali jalur sanad guru dan hubungan antara para masyaikh.' },
];

export default function AboutPage() {
  return (
    <ProsePage
      eyebrow="Tentang"
      title="Tentang MySanad"
      description="Direktori dan Digitalisasi Sanad al-Quran Malaysia."
    >
      <p className="text-lg">
        MySanad ialah platform untuk mendokumenkan guru al-Quran di Malaysia beserta kelayakan dan jalur sanad mereka secara
        digital. Tujuannya ialah memelihara khazanah ilmu al-Quran untuk generasi akan datang dan memudahkan masyarakat mencari guru
        yang sesuai.
      </p>

      <h2>Untuk siapa</h2>
      <div className="not-prose grid gap-3 sm:grid-cols-3">
        {AUDIENCE.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-2xl border bg-card p-4 shadow-soft">
            <Icon className="size-5 text-gold-600" aria-hidden />
            <p className="mt-2 font-semibold text-forest-900">{title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>

      <h2>Bagaimana sanad didokumenkan</h2>
      <ol className="space-y-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="!ms-0 flex !list-none gap-4">
            <span
              aria-hidden
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-forest-900 text-sm font-semibold text-gold-200"
            >
              {i + 1}
            </span>
            <span>
              <span className="block font-semibold text-forest-900">{s.title}</span>
              <span className="text-muted-foreground">{s.body}</span>
            </span>
          </li>
        ))}
      </ol>
      <p>
        Rekod yang sudah diterbitkan masih boleh dibetulkan. Pembetulan disemak semula oleh pentadbir, dan versi yang telah diluluskan
        kekal dipaparkan sehingga pembetulan itu diluluskan.
      </p>

      <h2>Guru yang memerlukan bantuan</h2>
      <p>
        Sebahagian guru, terutamanya guru warga emas, mungkin tidak dapat memasukkan maklumat sendiri. Pentadbir MySanad boleh
        memasukkan maklumat bagi pihak mereka dengan kebenaran guru atau wakilnya. Profil sebegini dinyatakan dengan jelas pada
        halaman guru. Untuk mendapatkan bantuan ini, <Link href="/contact" className="font-medium text-forest-700 underline">hubungi kami</Link>.
      </p>

      <h2>Apa yang MySanad lakukan</h2>
      <ul>
        <li>Merekod maklumat guru dan jalur sanad dalam struktur yang tersusun dan boleh disemak.</li>
        <li>Menyemak profil, dokumen sokongan dan setiap hubungan dalam rantaian sanad secara berasingan.</li>
        <li>Memaparkan kepada umum hanya rekod yang telah disemak dan diterbitkan.</li>
        <li>Memaparkan sijil sanad hanya jika guru membenarkannya dan selepas sijil itu diluluskan.</li>
      </ul>

      <h2>Apa yang MySanad tidak lakukan</h2>
      <ul>
        <li>MySanad tidak mengisytiharkan kesahihan sesuatu sanad secara automatik.</li>
        <li>MySanad tidak mengeluarkan ijazah, tauliah atau pentauliahan ilmiah.</li>
        <li>MySanad tidak menggabungkan rekod perawi secara automatik berdasarkan persamaan nama.</li>
      </ul>

      <h2>Maksud lencana</h2>
      <div className="not-prose space-y-2">
        {[
          { icon: ShieldCheck, title: 'Profil Disahkan', body: 'Maklumat profil telah disemak oleh pentadbir.' },
          { icon: FileCheck2, title: 'Dokumen Disemak', body: 'Dokumen sokongan telah disemak oleh pentadbir.' },
          { icon: BookOpenCheck, title: 'Jalur Sanad Disemak', body: 'Jalur sanad yang didokumenkan telah disemak oleh pentadbir.' },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex items-start gap-3 rounded-xl border bg-card p-3">
            <Icon className="mt-0.5 size-5 shrink-0 text-forest-700" aria-hidden />
            <p>
              <strong className="text-forest-900">{title}</strong>
              <span className="text-muted-foreground"> — {body}</span>
            </p>
          </div>
        ))}
      </div>
      <p>
        Semakan pentadbir ialah semakan dokumentasi. Penilaian ilmiah terhadap sesuatu sanad kekal menjadi tanggungjawab para
        masyaikh dan institusi yang berautoriti.
      </p>

      <h2>Privasi</h2>
      <p>
        Maklumat sulit seperti nombor MyKad, alamat kediaman dan dokumen asal tidak dipaparkan kepada umum. Guru memilih maklumat
        hubungan yang boleh dipaparkan. Butiran lanjut dalam{' '}
        <Link href="/privacy" className="font-medium text-forest-700 underline">
          Dasar Privasi
        </Link>
        .
      </p>

      <div className="not-prose mt-10 rounded-2xl bg-forest-900 p-6 text-center text-white sm:p-8">
        <p className="text-xl font-semibold">Sertai komuniti digitalisasi sanad al-Quran</p>
        <p className="mx-auto mt-2 max-w-xl text-forest-100/90">
          Bantu kami mendokumentasikan khazanah ilmu al-Quran untuk generasi akan datang.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild variant="accent">
            <Link href="/register">
              <UserPlus aria-hidden /> Daftar sebagai guru
            </Link>
          </Button>
          <Button asChild variant="outline" className="border-white/30 bg-white/5 text-white hover:bg-white/10 hover:text-white">
            <Link href="/contact">Hubungi kami</Link>
          </Button>
        </div>
      </div>
    </ProsePage>
  );
}
