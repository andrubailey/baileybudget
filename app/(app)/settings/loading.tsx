import { Block } from "@/app/(app)/skeleton";

// Shape matches the real settings page: header, then the API tokens card.
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Block className="h-7 w-32" />
      </div>

      <Block className="h-[280px]" />
    </div>
  );
}
