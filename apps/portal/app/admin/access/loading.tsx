import { Skeleton, SkeletonTable } from "@/components/common/skeleton";

export default function Loading() {
  return (
    <>
      <div className="mb-8 space-y-2">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>

      <div className="space-y-3">
        {/* Grant count on the left, the granted/not-granted key on the right. */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Skeleton className="h-4 w-52" />
          <Skeleton className="h-4 w-40" />
        </div>
        <SkeletonTable rows={4} columns={5} />
      </div>
    </>
  );
}
