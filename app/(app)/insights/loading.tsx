import { Block } from "@/app/(app)/skeleton";

// Same shape as the Insights grid: header, range bar, the headline beside
// cash flow, then the pairs and triples below.
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Block className="h-7 w-32" />
        <Block className="h-4 w-96" />
      </div>
      <Block className="h-10 w-full max-w-xl" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <Block className="h-56 lg:col-span-8" />
        <Block className="h-56 lg:col-span-4" />
        <Block className="h-72 lg:col-span-6" />
        <Block className="h-72 lg:col-span-6" />
        <Block className="h-60 lg:col-span-4" />
        <Block className="h-60 lg:col-span-4" />
        <Block className="h-60 lg:col-span-4" />
      </div>
    </div>
  );
}
