function Block({ className }: { className: string }) {
  return (
    <div className={`animate-pulse rounded-xl bg-border/60 ${className}`} />
  );
}

// Shape matches the real budgets page: header, then the wide
// categories-by-month grid (a spreadsheet, so one block is the honest shape).
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Block className="h-7 w-32" />
        <Block className="h-4 w-96" />
      </div>

      <Block className="h-[480px]" />
    </div>
  );
}
