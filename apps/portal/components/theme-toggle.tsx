"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const emptySubscribe = () => () => {};

// next-themes resolves the real theme via a script that runs BEFORE React
// hydrates, so resolvedTheme already differs from the server on the very
// first client render - branching on it directly causes a hydration
// mismatch. useSyncExternalStore's dual snapshots are the canonical,
// lint-clean way to defer that branch to a post-hydration render instead
// of a manual mounted-flag + setState-in-effect.
function useHasMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

export function ThemeToggle() {
  const hasMounted = useHasMounted();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = hasMounted && resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? <Sun /> : <Moon />}
    </Button>
  );
}
