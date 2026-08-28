import Link from "next/link";
import { ArrowRight, Check, Circle, CircleCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export interface SetupStep {
  label: string;
  // What this step unlocks, in one line. Not a restatement of the label.
  description: string;
  href: string;
  cta: string;
  done: boolean;
}

interface SetupChecklistProps {
  title: string;
  // In dependency order: the first not-done step is the only one that gets a
  // call to action.
  steps: SetupStep[];
  className?: string;
}

// Ring geometry. Drawn as a stroked circle with a dash gap sized to the
// remaining work — no chart library, and it inherits the theme tokens.
const RING_RADIUS = 22;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// Server Component: static markup, no state. A fresh database lands on this
// with nothing done, so it has to answer "now what?" without the reader
// hunting through the sidebar.
export function SetupChecklist({ title, steps, className }: SetupChecklistProps) {
  const total = steps.length;
  if (total === 0) return null;

  const doneCount = steps.filter((step) => step.done).length;
  // Only the first unfinished step gets a link. Two competing calls to action
  // is the same as none.
  const nextIndex = steps.findIndex((step) => !step.done);

  if (doneCount === total) {
    return (
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground ring-1 ring-foreground/10",
          className
        )}
      >
        <CircleCheck className="size-4 shrink-0 text-foreground" aria-hidden />
        <p>
          <span className="font-medium text-foreground">{title}</span> — all done.
          Nothing left to set up here.
        </p>
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardContent className="flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <div className="relative size-14 shrink-0">
            <svg viewBox="0 0 56 56" className="size-14 -rotate-90" aria-hidden>
              <circle
                cx="28"
                cy="28"
                r={RING_RADIUS}
                fill="none"
                strokeWidth="4"
                className="stroke-border"
              />
              <circle
                cx="28"
                cy="28"
                r={RING_RADIUS}
                fill="none"
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={RING_CIRCUMFERENCE}
                strokeDashoffset={RING_CIRCUMFERENCE * (1 - doneCount / total)}
                className="stroke-foreground"
              />
            </svg>
            <span
              className="absolute inset-0 flex items-center justify-center font-mono text-xs tabular-nums"
              aria-hidden
            >
              {doneCount}/{total}
            </span>
            <span className="sr-only">
              {doneCount} of {total} steps done
            </span>
          </div>

          <div>
            <p className="font-medium">{title}</p>
            <p className="text-sm text-muted-foreground">
              Work top to bottom — each step unlocks the next.
            </p>
          </div>
        </div>

        <ol className="stagger space-y-4">
          {steps.map((step, index) => (
            <li key={step.label} className="animate-fade-up flex items-start gap-3">
              {step.done ? (
                <Check className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden />
              ) : (
                <Circle
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground/60"
                  aria-hidden
                />
              )}
              <div className="min-w-0">
                <p
                  className={cn(
                    "text-sm font-medium",
                    step.done && "text-muted-foreground"
                  )}
                >
                  {step.label}
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-sm text-muted-foreground",
                    step.done && "text-muted-foreground/70"
                  )}
                >
                  {step.description}
                </p>
                {index === nextIndex && (
                  <Link
                    href={step.href}
                    className="group mt-2 inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {step.cta}
                    <ArrowRight
                      className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
