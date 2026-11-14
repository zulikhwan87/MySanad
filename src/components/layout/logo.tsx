import Link from 'next/link';

export function Logo({ tagline }: { tagline?: string }) {
  return (
    <Link href="/" className="flex items-center gap-2.5" aria-label="MySanad">
      <span className="flex size-9 items-center justify-center rounded-xl bg-forest-800 font-amiri text-lg font-bold text-gold-300 shadow-soft">
        س
      </span>
      <span className="leading-tight">
        <span className="block text-base font-bold tracking-tight text-forest-900">MySanad</span>
        {tagline ? <span className="hidden text-[11px] text-muted-foreground sm:block">{tagline}</span> : null}
      </span>
    </Link>
  );
}
