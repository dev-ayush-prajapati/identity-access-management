import { Skeleton } from "@/components/common/skeleton";

// Mirrors /superadmin: PageHeader, the three-stat row, then the "what this
// zone controls" note.
export default function Loading() {
  return (
    <>
      <div className="mb-8 space-y-2">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>

      <div className="space-y-8">
        <div className="flex flex-wrap gap-4">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-24 min-w-[140px] flex-1 rounded-xl" />
          ))}
        </div>

        <div className="space-y-2 rounded-lg border p-6">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    </>
  );
}
