import { Block, SkeletonList } from "@/app/(app)/skeleton";

// Shape matches the Spending overview: header, tabs, the month strip, the
// pace chart, the full category breakdown, then Recent Transactions and
// Upcoming beside each other, with the cash-flow/largest/frequent rail
// on the right.
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Block className="h-7 w-40" />
        <Block className="h-4 w-80" />
      </div>
      <Block className="h-9 w-52" />
      <Block className="h-36 w-full" />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <Block className="h-72 w-full rounded-xl" />
          <div className="card space-y-6">
            <Block className="h-10 w-full" />
            <Block className="mx-auto size-56 rounded-full" />
            <SkeletonList rows={5} className="border-0 p-0 shadow-none" />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <SkeletonList rows={6} />
            <Block className="h-72 w-full rounded-xl" />
          </div>
        </div>
        <div className="space-y-6">
          <Block className="h-44" />
          <SkeletonList rows={3} />
          <Block className="h-44" />
        </div>
      </div>
    </div>
  );
}
