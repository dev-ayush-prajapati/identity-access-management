import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { AnimatedNumber } from "@/components/common/animated-number";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: number;
  // One line of context under the label — what the number means, or what the
  // reader can do about it.
  hint?: string;
  // Where this number is managed. Leave it out when the signed-in tier can't
  // act on it (an Admin can't edit the application catalog): a hover lift that
  // leads to a 404 is worse than no affordance at all.
  href?: string;
  // A --chart-N token to tint the icon chip with. Optional — omitting it
  // keeps the plain muted icon every existing StatCard already uses.
  accent?: string;
  className?: string;
}

// Server Component. AnimatedNumber is the only client piece, and it renders the
// final value on the server, so the real number is in the HTML either way.
export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  href,
  accent,
  className,
}: StatCardProps) {
  const body = (
    <CardContent className="flex flex-col gap-1">
      <div className="flex items-start justify-between gap-3">
        <span className="text-3xl leading-none font-semibold tracking-tight">
          <AnimatedNumber value={value} />
        </span>
        {accent ? (
          <div
            className="flex size-8 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `color-mix(in oklch, ${accent} 16%, transparent)` }}
          >
            <Icon className="size-4 shrink-0" style={{ color: accent }} aria-hidden />
          </div>
        ) : (
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium">{label}</span>
        {href && (
          <ArrowRight
            className="size-3.5 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5"
            aria-hidden
          />
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </CardContent>
  );

  if (!href) {
    return <Card className={cn("h-full", className)}>{body}</Card>;
  }

  return (
    <Link
      href={href}
      className={cn(
        "group block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className
      )}
    >
      <Card className="h-full transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:ring-foreground/25">
        {body}
      </Card>
    </Link>
  );
}
