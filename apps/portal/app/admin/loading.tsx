import { Skeleton, SkeletonTable } from "@/components/common/skeleton";

// Mirrors /admin: PageHeader, the four-stat row, then recent activity.
export default function Loading() {
  return (
    <>
      <div className="mb-8 space-y-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>

      <div className="space-y-8">
        <div className="flex flex-wrap gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24 min-w-[140px] flex-1 rounded-xl" />
          ))}
        </div>

        <div className="space-y-4">
          <Skeleton className="h-5 w-40" />
          <SkeletonTable rows={5} columns={4} />
        </div>
      </div>
    </>
  );
}
