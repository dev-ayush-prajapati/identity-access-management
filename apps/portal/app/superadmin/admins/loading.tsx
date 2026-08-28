import { Skeleton, SkeletonTable } from "@/components/common/skeleton";

export default function Loading() {
  return (
    <>
      <div className="mb-8 space-y-2">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>

      <div className="space-y-4">
        <div className="flex justify-end">
          <Skeleton className="h-12 w-32 rounded-lg" />
        </div>
        {/* Admins carry no Role, so there's no Role column here. */}
        <SkeletonTable rows={4} columns={3} />
      </div>
    </>
  );
}
