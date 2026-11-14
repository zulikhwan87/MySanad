import type { Metadata } from 'next';
import { ProsePage } from '@/components/public/prose-page';
import { getPublicSettings } from '@/lib/data/settings';

export const metadata: Metadata = { title: 'Hubungi Kami' };

export default async function ContactPage() {
  const email = (await getPublicSettings()).contact_email ?? process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  return (
    <ProsePage eyebrow="Hubungi" title="Hubungi Kami" description="Pertanyaan, pembetulan maklumat dan laporan isu.">
      {email ? (
        <p>
          Emel:{' '}
          <a href={`mailto:${email}`} className="font-medium text-primary hover:underline">
            {email}
          </a>
        </p>
      ) : (
        <p className="rounded-xl border p-4 text-sm text-muted-foreground">Saluran hubungan rasmi akan diumumkan tidak lama lagi.</p>
      )}
      <h2>Pembetulan maklumat guru</h2>
      <p>
        Guru berdaftar boleh mengemas kini profil sendiri melalui Portal Guru. Orang awam yang mendapati maklumat yang tidak tepat
        boleh menghubungi kami dengan menyatakan kod guru (contoh: MSN-000123) dan butiran pembetulan.
      </p>
      <h2>Isu keselamatan</h2>
      <p>Laporkan kelemahan keselamatan secara peribadi. Jangan kongsi butiran kelemahan di media sosial.</p>
    </ProsePage>
  );
}
