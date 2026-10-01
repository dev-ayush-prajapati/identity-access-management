import { Activity, Check, X, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { actionVerb } from "@/lib/audit-query";
import { cn } from "@/lib/utils";

// Category (what a filter groups by) lives in lib/audit-query.ts, next to the
// server-side filtering that uses it. A new action shipped by a future route
// renders as a neutral badge rather than crashing the log.
type ActionTone = "positive" | "destructive" | "neutral";

// Tone and category are close but not the same axis: GRANTED and REVOKED are
// both "access" to a filter, yet one adds permission and one takes it away.
function toneOf(action: string): ActionTone {
  switch (actionVerb(action)) {
    case "CREATED":
    case "GRANTED":
      return "positive";
    case "DELETED":
    case "ARCHIVED":
    case "REVOKED":
    case "DENIED":
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
