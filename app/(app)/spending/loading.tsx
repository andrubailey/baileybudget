import { Block, SkeletonList } from "@/app/(app)/skeleton";

// Shape matches the Spending overview: header, tabs, then the chart card
// and two cards beside it, with the breakdown and income cards on the right.
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Block className="h-7 w-40" />
        <Block className="h-4 w-80" />
      </div>
      <Block className="h-9 w-52" />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Block className="h-72 w-full rounded-xl" />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <SkeletonList rows={6} />
            <Block className="h-72 w-full rounded-xl" />
          </div>
        </div>
        <div className="space-y-6">
          <Block className="h-96 w-full rounded-xl" />
          <Block className="h-36 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}
