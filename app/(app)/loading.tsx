import { Block, SkeletonList, SkeletonStat } from "@/app/(app)/skeleton";

// Shown by Next.js while the dashboard's Server Component data is fetching
// (e.g. switching ranges) so navigation doesn't just flash blank. Shape
// matches the real dashboard: hero, attention strip, three stats, then
// the budget + recent pair.
export default function Loading() {
  return (
    <div className="min-w-0 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Block className="h-4 w-40" />
          <Block className="h-7 w-64" />
        </div>
        <div className="flex items-center gap-3">
          <Block className="size-11 rounded-full" />
          <Block className="h-10 w-36" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-5">
            <Block className="h-[190px] 2xl:col-span-2" />
            <SkeletonStat className="h-[190px]" />
            <SkeletonStat className="h-[190px]" />
            <SkeletonStat className="h-[190px]" />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 2xl:grid-cols-5">
            <Block className="h-[420px] 2xl:col-span-3" />
            <SkeletonList rows={7} className="2xl:col-span-2" />
          </div>
          <Block className="h-[140px]" />
        </div>
        <SkeletonList rows={5} />
      </div>
    </div>
  );
}
