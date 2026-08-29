import { Skeleton } from "@/components/common/skeleton";

// The real grid is as long as the Role's granted applications; four tiles is
// enough to read as "apps are coming" without promising a count.
export default function Loading() {
  return (
    <>
      <div className="mb-8 space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </>
  );
}
