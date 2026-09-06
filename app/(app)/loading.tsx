function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-border/60 ${className}`} />;
}

// Shown by Next.js while an (app) page's Server Component data is fetching
// (e.g. switching dashboard ranges) so navigation doesn't just flash blank.
export default function Loading() {
  return (
    <div className="grid grid-cols-1 gap-10 xl:grid-cols-[1fr_minmax(280px,320px)] xl:items-start">
      <div className="min-w-0 space-y-10">
        <Block className="h-10 w-64" />
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Block className="h-28" />
          <Block className="h-28" />
          <Block className="h-28" />
          <Block className="h-28" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[384px_1fr]">
          <Block className="h-72" />
          <Block className="h-72" />
        </div>
        <Block className="h-80" />
      </div>
      <div className="space-y-10">
        <Block className="h-64" />
        <Block className="h-64" />
      </div>
    </div>
  );
}
