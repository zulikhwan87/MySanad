import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/public/states';

export function NeedsTeacher() {
  return (
    <EmptyState title="Profil guru belum dicipta">
      <p>Mulakan pendaftaran untuk mencipta profil guru anda.</p>
      <Button asChild className="mt-3">
        <Link href="/teacher/register">Mula pendaftaran</Link>
      </Button>
    </EmptyState>
  );
}
