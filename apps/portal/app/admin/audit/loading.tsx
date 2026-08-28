import { Skeleton, SkeletonTable } from "@/components/common/skeleton";

export default function Loading() {
  return (
    <>
      <div className="mb-8 space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>

      {/* Who, action, details, when. */}
      <SkeletonTable rows={8} columns={4} />
    </>
  );
}
