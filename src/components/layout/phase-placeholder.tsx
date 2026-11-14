import Link from 'next/link';
import { Construction } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Honest placeholder for routes whose feature lands in a later phase.
 * Shows no fabricated data and makes the unfinished state explicit.
 */
export function PhasePlaceholder({
  title,
  description,
  phase,
  backHref = '/',
}: {
  title: string;
  description: string;
  phase: number;
  backHref?: string;
}) {
  return (
    <div className="container py-12">
      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <Badge variant="gold" className="w-fit">
            <Construction className="size-3.5" aria-hidden />
            Dalam pembangunan · Fasa {phase}
          </Badge>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Halaman ini belum berfungsi sepenuhnya. Tiada data contoh dipaparkan supaya maklumat yang belum disemak tidak disalah anggap
            sebagai rekod sebenar.
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link href={backHref}>Kembali</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
