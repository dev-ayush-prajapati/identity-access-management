import { cn } from "@/lib/utils";

// Loading placeholder. Pair with a route's loading.tsx so a slow Prisma query
// streams in behind a shape that matches what's coming, rather than a blank
// page. The shimmer is CSS-only (see globals.css) and stills under reduced
// motion.
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn("skeleton-shimmer rounded-md bg-muted", className)}
      {...props}
    />
  );
}

// A table-shaped block of skeletons — the most common loading shape in this
// app, since every management screen is a table.
export function SkeletonTable({ rows = 5, columns = 3 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="flex gap-4 border-b bg-muted/40 px-4 py-3">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      <div className="divide-y">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex gap-4 px-4 py-4">
            {Array.from({ length: columns }, (_, c) => (
              <Skeleton key={c} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
