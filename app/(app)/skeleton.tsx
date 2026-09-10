// Loading-state primitives shared by every route's loading.tsx. Each one
// used to define its own `Block`; now the pulse color, radius and the
// "list of rows" shape come from one place so skeletons match the real
// cards they stand in for.
export function Block({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-border/60 ${className}`} />;
}

// A card-shaped skeleton with a header line and N transaction-shaped rows
// (avatar, two text lines, amount) — the shape of every list in the app.
export function SkeletonList({
  rows = 6,
  className = "",
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={`card ${className}`}>
      <div className="mb-4 flex items-center justify-between">
        <Block className="h-5 w-40" />
        <Block className="h-3 w-14" />
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex items-center gap-3 py-3">
            <Block className="size-9 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Block className="h-3.5 w-1/2" />
              <Block className="h-3 w-1/3" />
            </div>
            <Block className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

// A metric tile: icon, label, big number.
export function SkeletonStat({ className = "" }: { className?: string }) {
  return (
    <div className={`card flex flex-col justify-between ${className}`}>
      <Block className="size-9 rounded-full" />
      <div className="mt-4 space-y-2">
        <Block className="h-3 w-24" />
        <Block className="h-8 w-32" />
        <Block className="h-3 w-28" />
      </div>
    </div>
  );
}
