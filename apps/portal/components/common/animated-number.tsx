"use client";

import { useEffect, useState } from "react";

interface AnimatedNumberProps {
  value: number;
  // Total run time. Kept short — this is a stat card, not a slot machine.
  durationMs?: number;
  className?: string;
}

// Counts up to `value` once on mount.
//
// The server (and the first client render) emit the *final* value, so the
// markup hydrates identically and the real number is what's there without JS.
// The count-up only starts in an effect, after hydration, and is skipped
// entirely under prefers-reduced-motion.
export function AnimatedNumber({ value, durationMs = 700, className }: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);
  const [lastValue, setLastValue] = useState(value);

  // Adjusting state during render is React's documented answer to "a prop
  // changed" — cheaper than an effect, and it keeps the number honest the
  // instant fresh data arrives (a router.refresh after a mutation), whether or
  // not the count-up below ever runs.
  if (lastValue !== value) {
    setLastValue(value);
    setDisplay(value);
  }

  useEffect(() => {
    // Nothing to count through — skip the frame loop entirely on 0.
    if (value === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let frame = 0;
    let start: number | null = null;

    // Every setDisplay below runs inside a rAF callback rather than in the
    // effect body, so this never triggers the cascading synchronous re-render
    // that setState-directly-in-an-effect causes. The first frame lands at
    // ~0, which is what makes it read as a count-up without seeding 0 first.
    function tick(now: number) {
      start ??= now;
      const progress = Math.min((now - start) / durationMs, 1);
      // easeOutCubic — fast out of the gate, settles onto the final number
      // instead of crawling the last few digits.
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      }
    }

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  // tabular-nums stops the width jitter as digits change.
  return <span className={`tabular-nums ${className ?? ""}`}>{display}</span>;
}
