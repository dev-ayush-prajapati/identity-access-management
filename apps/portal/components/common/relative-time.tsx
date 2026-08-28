"use client";

import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

// Same trick as ThemeToggle: the server has no idea what "now" is on the
// client, so rendering a relative string directly would guarantee a hydration
// mismatch. Render the absolute timestamp on the server and for the first
// client render, then swap to relative once mounted.
function useHasMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

const UNITS: [limitSeconds: number, perUnit: number, label: string][] = [
  [60, 1, "second"],
  [3600, 60, "minute"],
  [86400, 3600, "hour"],
  [604800, 86400, "day"],
  [2629800, 604800, "week"],
  [31557600, 2629800, "month"],
];

function formatRelative(then: Date, now: Date) {
  const seconds = Math.round((then.getTime() - now.getTime()) / 1000);
  const absolute = Math.abs(seconds);

  if (absolute < 45) return "just now";

  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [limit, perUnit, label] of UNITS) {
    if (absolute < limit) {
      return formatter.format(Math.round(seconds / perUnit), label as Intl.RelativeTimeFormatUnit);
    }
  }
  return formatter.format(Math.round(seconds / 31557600), "year");
}

interface RelativeTimeProps {
  date: Date | string;
  className?: string;
}

export function RelativeTime({ date, className }: RelativeTimeProps) {
  const hasMounted = useHasMounted();
  const value = typeof date === "string" ? new Date(date) : date;
  const absolute = value.toLocaleString();

  return (
    <time dateTime={value.toISOString()} title={absolute} className={className}>
      {hasMounted ? formatRelative(value, new Date()) : absolute}
    </time>
  );
}
