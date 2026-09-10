import { Block, SkeletonList } from "@/app/(app)/skeleton";

// Shape matches the real transactions page: header, tabs, the
// add-transaction button + period switcher row, then the table.
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Block className="h-7 w-40" />
          <Block className="h-4 w-72" />
        </div>
      </div>

      <Block className="h-10 w-full max-w-md" />

      <div className="flex items-center justify-between gap-4">
        <Block className="h-10 w-40" />
        <Block className="h-10 w-32" />
      </div>

      <SkeletonList rows={10} />
    </div>
  );
}
