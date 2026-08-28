import { Skeleton } from "@/components/common/skeleton";

export default function Loading() {
  return (
    <>
      <div className="mb-8 space-y-2">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-8 w-28" />
        <Skeleton className="h-4 w-full max-w-sm" />
      </div>

      <div className="max-w-2xl space-y-4 rounded-xl border p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-56" />
        {/* Account type, role, member since — label left, value right. */}
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex justify-between border-t pt-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    </>
  );
}
