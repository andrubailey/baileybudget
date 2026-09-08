function Block({ className }: { className: string }) {
  return (
    <div className={`animate-pulse rounded-xl bg-border/60 ${className}`} />
  );
}

// Shape matches the real goals page: header, then the objectives card.
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Block className="h-7 w-24" />
        <Block className="h-4 w-80" />
      </div>

      <Block className="h-[360px]" />
    </div>
  );
}
