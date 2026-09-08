// Pure weekly bucketing for employee growth — mirrors bucketActivityByDay in
// activity-chart.tsx but by week instead of by day. Kept in its own
// non-"use client" file so the Server Component page (/admin) can call it
// directly, the way it already does with the daily activity bucketer.

export interface WeeklyGrowthPoint {
  weekLabel: string;
  count: number;
}

export const GROWTH_WINDOW_WEEKS = 8;

export function growthWindowStart() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (GROWTH_WINDOW_WEEKS * 7 - 1));
  return start;
}

function formatWeekLabel(weekStart: Date) {
  return weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function bucketWeeklyGrowth(entries: { createdAt: Date }[]): WeeklyGrowthPoint[] {
  const windowStart = growthWindowStart();
  const msPerDay = 24 * 60 * 60 * 1000;

  const counts = new Array<number>(GROWTH_WINDOW_WEEKS).fill(0);
  for (const entry of entries) {
    const diffDays = Math.floor((entry.createdAt.getTime() - windowStart.getTime()) / msPerDay);
    const weekIndex = Math.floor(diffDays / 7);
    // Anything outside the window is dropped rather than folded into an edge
    // bucket — same reasoning as bucketActivityByDay.
    if (weekIndex >= 0 && weekIndex < GROWTH_WINDOW_WEEKS) {
      counts[weekIndex] += 1;
    }
  }

  return counts.map((count, index) => {
    const weekStart = new Date(windowStart);
    weekStart.setDate(weekStart.getDate() + index * 7);
    return { weekLabel: formatWeekLabel(weekStart), count };
  });
}
