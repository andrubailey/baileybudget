function Block({ className }: { className: string }) {
  return (
    <div className={`animate-pulse rounded-xl bg-border/60 ${className}`} />
  );
}

// Shown by Next.js while an (app) page's Server Component data is fetching
// (e.g. switching dashboard ranges) so navigation doesn't just flash blank.
// Shape matches the real dashboard layout in page.tsx.
export default function Loading() {
  return (
    <div className="min-w-0 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Block className="h-4 w-40" />
          <Block className="h-7 w-64" />
        </div>
        <div className="flex items-center gap-3">
          <Block className="size-10 rounded-full" />
          <Block className="h-10 w-36" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Block className="h-[190px] xl:col-span-2" />
        <Block className="h-[190px]" />
        <Block className="h-[190px]" />
        <Block className="h-[190px]" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Block className="h-[420px]" />
        <Block className="h-[420px]" />
      </div>

      <Block className="h-[140px]" />
    </div>
  );
}
