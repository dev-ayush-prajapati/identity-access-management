import { Activity, Check, X, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Actions are stored as free-form strings (ROLE_CREATED, ACCESS_REVOKED,
// AUDIT_LOG_EXPORTED, ...), never a DB enum — so everything here reads the
// trailing verb instead of matching a fixed list. A new action shipped by a
// future route renders as a neutral badge rather than crashing the log.
export type AuditActionCategory = "created" | "updated" | "deleted" | "access" | "other";

function verbOf(action: string): string {
  const parts = action.split("_");
  return (parts[parts.length - 1] ?? "").toUpperCase();
}

// Kept pure and separate from the badge: the explorer filters on this, and a
// filter is worth being able to reason about without rendering anything.
export function categorizeAction(action: string): AuditActionCategory {
  switch (verbOf(action)) {
    case "CREATED":
      return "created";
    case "UPDATED":
      return "updated";
    case "DELETED":
      return "deleted";
    case "GRANTED":
    case "REVOKED":
      return "access";
    default:
      return "other";
  }
}

type ActionTone = "positive" | "destructive" | "neutral";

// Tone and category are close but not the same axis: GRANTED and REVOKED are
// both "access" to a filter, yet one adds permission and one takes it away.
function toneOf(action: string): ActionTone {
  switch (verbOf(action)) {
    case "CREATED":
    case "GRANTED":
      return "positive";
    case "DELETED":
    case "REVOKED":
      return "destructive";
    default:
      return "neutral";
  }
}

const TONES: Record<
  ActionTone,
  { icon: LucideIcon; variant: "secondary" | "destructive" | "outline"; className?: string }
> = {
  // No green anywhere: the palette is monochrome, so "something was added"
  // is carried by the check mark and a slightly heavier fill, not by hue.
  positive: { icon: Check, variant: "secondary", className: "bg-foreground/10 text-foreground" },
  destructive: { icon: X, variant: "destructive" },
  neutral: { icon: Activity, variant: "outline" },
};

interface ActionBadgeProps {
  action: string;
  className?: string;
}

export function ActionBadge({ action, className }: ActionBadgeProps) {
  const { icon: Icon, variant, className: toneClassName } = TONES[toneOf(action)];

  return (
    <Badge variant={variant} className={cn("font-mono", toneClassName, className)}>
      <Icon aria-hidden />
      {action}
    </Badge>
  );
}
