import { FadeIn } from '@/components/motion/motion';

export function PageHeader({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description?: string; children?: React.ReactNode }) {
  return (
    <section className="border-b bg-secondary/60">
      <FadeIn className="container space-y-3 py-10">
        {eyebrow ? <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">{eyebrow}</p> : null}
        <h1 className="text-2xl font-bold tracking-tight text-forest-900 sm:text-3xl">{title}</h1>
        {description ? <p className="max-w-3xl text-muted-foreground">{description}</p> : null}
        {children}
      </FadeIn>
    </section>
  );
}
