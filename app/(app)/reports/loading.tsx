import { Block } from "@/app/(app)/skeleton";

// Shape matches the real reports page (Trends tab, the default view):
// header + tabs, then the big chart, then a row of stat cards.
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Block className="h-7 w-32" />
        <Block className="h-4 w-64" />
      </div>

      <Block className="h-10 w-full max-w-md" />

      <Block className="h-[420px]" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Block className="h-[120px]" />
        <Block className="h-[120px]" />
        <Block className="h-[120px]" />
        <Block className="h-[120px]" />
      </div>
    </div>
  );
}
