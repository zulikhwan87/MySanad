export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Memuatkan">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-56 animate-pulse rounded-2xl border bg-card p-5">
          <div className="flex gap-4">
            <div className="size-14 rounded-2xl bg-muted" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-4 w-3/4 rounded bg-muted" />
              <div className="h-3 w-1/2 rounded bg-muted" />
            </div>
          </div>
          <div className="mt-6 space-y-2">
            <div className="h-3 w-2/3 rounded bg-muted" />
            <div className="h-3 w-1/2 rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ListPageSkeleton() {
  return (
    <>
      <div className="border-b bg-secondary/60">
        <div className="container space-y-3 py-10">
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
          <div className="h-8 w-72 animate-pulse rounded bg-muted" />
          <div className="h-10 max-w-2xl animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
      <div className="container py-8">
        <CardGridSkeleton />
      </div>
    </>
  );
}
