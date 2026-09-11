import { Block } from "@/app/(app)/skeleton";

// Shape matches the real accounts page: header, add-account/add-transfer
// buttons, then a grid of account cards.
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Block className="h-7 w-32" />
        <Block className="h-4 w-72" />
      </div>

      <div className="flex gap-2">
        <Block className="h-10 w-36" />
        <Block className="h-10 w-36" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <Block key={i} className="h-[220px]" />
        ))}
      </div>
    </div>
  );
}
