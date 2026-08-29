import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface ActivityDay {
  // Local calendar day, as `YYYY-MM-DD`.
  date: string;
  count: number;
}

export const ACTIVITY_WINDOW_DAYS = 14;

// Local-date key. `toISOString().slice(0, 10)` would bucket by UTC, which
// pushes late-evening events into tomorrow for anyone east of UTC and pulls
// early-morning ones back for anyone west of it.
function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// Midnight local time on the first day of the window — the `createdAt` floor
// the page should query with, so the query and the buckets agree on where the
// window starts.
export function activityWindowStart() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (ACTIVITY_WINDOW_DAYS - 1));
  return start;
}

// Bucketed in JS rather than with a Prisma groupBy over a date expression:
// grouping in SQL would bucket by the *database* timezone, and it can't emit
// the zero-count days that make the axis continuous.
export function bucketActivityByDay(entries: { createdAt: Date }[]): ActivityDay[] {
  const buckets = new Map<string, number>();

  const cursor = activityWindowStart();
  for (let index = 0; index < ACTIVITY_WINDOW_DAYS; index++) {
    buckets.set(localDateKey(cursor), 0);
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const entry of entries) {
    const key = localDateKey(new Date(entry.createdAt));
    const current = buckets.get(key);
    // Anything outside the window is dropped rather than folded into an edge
    // bucket, which would show as a spike that never happened.
    if (current !== undefined) buckets.set(key, current + 1);
  }

  // Map keeps insertion order, so this comes back oldest-first.
  return [...buckets].map(([date, count]) => ({ date, count }));
}

// Component-wise on purpose: `new Date("2026-08-15")` is parsed as UTC
// midnight and formats as the day before west of UTC.
function parseDayKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatAxis(key: string) {
  return parseDayKey(key).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatTooltip(day: ActivityDay) {
  const label = parseDayKey(day.date).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `${label} — ${day.count} ${day.count === 1 ? "event" : "events"}`;
}

function barHeight(count: number, max: number) {
  // A quiet day keeps a 2px stub so the window reads as one continuous stretch
  // of time instead of as missing data.
  if (count === 0) return "2px";
  // 6% floor: a single event next to a busy day should still be a bar you can
  // see and hover.
  return `${Math.max(6, (count / max) * 100)}%`;
}

interface ActivityChartProps {
  days: ActivityDay[];
  className?: string;
}

// Server Component. Plain divs — a chart library for 14 bars would be more
// bundle than the whole page.
export function ActivityChart({ days, className }: ActivityChartProps) {
  if (days.length === 0) return null;

  const total = days.reduce((sum, day) => sum + day.count, 0);
  // Floor of 1 keeps the ratio finite on a fresh database where every day is 0.
  const max = Math.max(1, ...days.map((day) => day.count));

  return (
    <Card className={className}>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="font-medium">Activity</p>
            <p className="text-sm text-muted-foreground">
              Audit events over the last {days.length} days.
            </p>
          </div>
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {total} total
          </span>
        </div>

        <div>
          <div className="flex h-28 items-end gap-1">
            {days.map((day) => (
              <div
                key={day.date}
                title={formatTooltip(day)}
                className="group/bar flex h-full flex-1 cursor-default items-end"
              >
                <div
                  style={{ height: barHeight(day.count, max) }}
                  className={cn(
                    "w-full rounded-sm transition-colors duration-200",
                    day.count === 0
                      ? "bg-border group-hover/bar:bg-muted-foreground/50"
                      : "bg-foreground/70 group-hover/bar:bg-foreground"
                  )}
                />
              </div>
            ))}
          </div>

          <div className="mt-2 flex items-center justify-between font-mono text-xs text-muted-foreground">
            <span>{formatAxis(days[0].date)}</span>
            <span>{formatAxis(days[days.length - 1].date)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
