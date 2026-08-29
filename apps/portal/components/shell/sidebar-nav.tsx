"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { NavItem } from "@/components/shell/nav-items";
import { NAV_ICONS } from "@/components/shell/nav-icons";

interface SidebarNavProps {
  items: NavItem[];
}

// Client component only because the active link depends on the current
// pathname. The zone root (e.g. /admin) has to match exactly or it would
// light up on every sub-page too.
export function SidebarNav({ items }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Section"
      className="flex gap-1 overflow-x-auto p-3 md:flex-col md:overflow-visible"
    >
      {items.map((item) => {
        const Icon = NAV_ICONS[item.icon];
        const isActive = item.exact
          ? pathname === item.href
          : pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors duration-200 ease-out",
              isActive
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            )}
          >
            {isActive && (
              // Marker for the vertical nav only: below md this is a
              // horizontal strip, where a left-edge bar reads as a divider
              // between items rather than as "you are here".
              <span
                aria-hidden
                className="animate-fade-in absolute top-1/2 -left-1.5 hidden h-5 w-1 -translate-y-1/2 rounded-full bg-foreground md:block"
              />
            )}
            <Icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
