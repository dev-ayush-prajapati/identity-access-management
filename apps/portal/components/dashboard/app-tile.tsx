import { ExternalLink } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface AppTileProps {
  name: string;
  description: string | null;
  url: string;
  // Result of isHttpUrl(url) on the page. An unsafe tile must never become a
  // link — the caller decides that, this component only renders the two
  // outcomes.
  safe: boolean;
  // Lands on whichever element is the root (the <a> when safe, the card when
  // not), so `.stagger` on the grid still sees a direct child to delay.
  className?: string;
}

// Two letters when the name reads as two words ("Finance App" → FA), one
// otherwise. Without the two-word case a catalog of "Payroll Portal",
// "Payroll Console"… renders as an indistinguishable wall of P.
function monogram(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length > 1 ? words[0][0] + words[1][0] : words[0][0];
  return letters.toUpperCase();
}

export function AppTile({ name, description, url, safe, className }: AppTileProps) {
  const card = (
    <Card
      className={cn(
        "h-full transition-all duration-200",
        safe
          ? "group-hover:-translate-y-0.5 group-hover:shadow-md group-hover:ring-foreground/25"
          : "opacity-60",
        !safe && className
      )}
    >
      <CardHeader className="flex items-start gap-4">
        <div
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted font-mono text-sm font-medium text-muted-foreground transition-colors duration-200",
            safe && "group-hover:bg-foreground group-hover:text-background"
          )}
          aria-hidden
        >
          {monogram(name)}
        </div>

        <div className="min-w-0 flex-1">
          <CardTitle className="truncate">{name}</CardTitle>
          <CardDescription
            className={cn(
              "mt-1 line-clamp-2",
              // The URL is only a fallback caption — set it in mono so it
              // reads as an address, not as a description someone wrote.
              safe && !description && "font-mono text-xs break-all"
            )}
          >
            {safe
              ? description || url
              : "Invalid application URL — contact your admin."}
          </CardDescription>
        </div>

        {safe && (
          <ExternalLink
            className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
            aria-hidden
          />
        )}
      </CardHeader>
    </Card>
  );

  if (!safe) return card;

  return (
    <a
      href={url}
      className={cn(
        "group block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className
      )}
    >
      {card}
    </a>
  );
}
