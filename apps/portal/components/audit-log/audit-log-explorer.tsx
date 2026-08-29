"use client";

import { useMemo, useState } from "react";
import { Search, SearchX } from "lucide-react";
import { categorizeAction, type AuditActionCategory } from "@/components/audit-log/action-badge";
import { AuditLogTable, type AuditLogRow } from "@/components/audit-log/audit-log-table";
import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Filter = AuditActionCategory | "all";

// "other" is intentionally not a chip: it exists so an unrecognized action
// still lands in a bucket, but nobody would think to click it.
const CHIPS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "created", label: "Created" },
  { value: "updated", label: "Updated" },
  { value: "deleted", label: "Deleted" },
  { value: "access", label: "Access" },
];

interface AuditLogExplorerProps {
  logs: AuditLogRow[];
  limit: number;
}

// Filtering happens entirely over the rows the page already handed down — the
// query is capped at `limit` server-side, so narrowing it further costs nothing
// and needs no second round trip.
export function AuditLogExplorer({ logs, limit }: AuditLogExplorerProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const counts = useMemo(() => {
    const tally: Record<Filter, number> = {
      all: logs.length,
      created: 0,
      updated: 0,
      deleted: 0,
      access: 0,
      other: 0,
    };
    for (const log of logs) tally[categorizeAction(log.action)] += 1;
    return tally;
  }, [logs]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return logs.filter((log) => {
      if (filter !== "all" && categorizeAction(log.action) !== filter) return false;
      if (!needle) return true;
      // Every field the row displays is searchable, so what you can read is
      // what you can search for.
      return [log.user?.name, log.user?.email, log.action, log.details].some((field) =>
        field?.toLowerCase().includes(needle)
      );
    });
  }, [logs, query, filter]);

  function clearFilters() {
    setQuery("");
    setFilter("all");
  }

  // Nothing to search through — let the table make its own case for itself.
  if (logs.length === 0) {
    return <AuditLogTable logs={logs} limit={limit} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people, actions, details"
            aria-label="Search the audit log"
            className="pl-8"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by action">
          {CHIPS.map((chip) => {
            const active = filter === chip.value;
            return (
              <button
                key={chip.value}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(chip.value)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {chip.label}
                <span
                  className={cn(
                    "font-mono text-[0.65rem]",
                    active ? "text-primary-foreground/70" : "text-muted-foreground/70"
                  )}
                >
                  {counts[chip.value]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        Showing {filtered.length} of {logs.length} {logs.length === 1 ? "entry" : "entries"}.
        {logs.length >= limit && ` Only the latest ${limit} are queried.`}
      </p>

      {filtered.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No entries match"
          description="Nothing in the entries loaded here matches that search and action filter."
          action={
            <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <AuditLogTable logs={filtered} limit={limit} showFooter={false} />
      )}
    </div>
  );
}
