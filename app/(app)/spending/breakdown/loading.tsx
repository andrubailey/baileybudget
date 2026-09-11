import { Block, SkeletonList } from "@/app/(app)/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Block className="h-7 w-40" />
        <Block className="h-4 w-80" />
      </div>
      <Block className="h-9 w-72" />
      <Block className="h-36 w-full" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="card space-y-6">
          <Block className="h-10 w-full" />
          <Block className="mx-auto size-56 rounded-full" />
          <SkeletonList rows={5} className="border-0 p-0 shadow-none" />
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
