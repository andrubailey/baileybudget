import { SkeletonList } from "@/app/(app)/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-md">
      <SkeletonList rows={6} />
    </div>
  );
}
