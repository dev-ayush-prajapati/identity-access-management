import { Skeleton, SkeletonTable } from "@/components/common/skeleton";

export default function Loading() {
  return (
    <>
      <div className="mb-8 space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>

      <div className="space-y-4">
        <div className="flex justify-end">
          <Skeleton className="h-12 w-36 rounded-lg" />
        </div>
        {/* Name, email, role, row menu. */}
        <SkeletonTable rows={5} columns={4} />
      </div>
    </>
  );
}
