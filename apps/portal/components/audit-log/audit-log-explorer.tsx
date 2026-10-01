import Form from "next/form";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search, SearchX } from "lucide-react";
import { AuditLogTable, type AuditLogRow } from "@/components/audit-log/audit-log-table";
import { EmptyState } from "@/components/common/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AUDIT_PAGE_SIZE,
  MAX_QUERY_LENGTH,
  auditHref,
  pageCount,
  type AuditFilter,
  type AuditQuery,
} from "@/lib/audit-query";
import { cn } from "@/lib/utils";

const CHIPS: { value: AuditFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "created", label: "Created" },
  { value: "updated", label: "Updated" },
  { value: "deleted", label: "Deleted" },
  { value: "access", label: "Access" },
  { value: "denied", label: "Denied" },
];

interface AuditLogExplorerProps {
  // Just the current page, already filtered server-side.
  logs: AuditLogRow[];
  // `page` is already clamped to the real page range.
  query: AuditQuery;
  // Rows matching the full query, across every page.
  total: number;
  // Per-chip counts for the current search — so each chip says what clicking
  // it would show.
  counts: Record<AuditFilter, number>;
}

// Server Component. Every control is a link or a plain GET form, so the URL is
// the whole state: filtering and paging run over the entire log in Postgres,
// not over whatever slice one page happened to load.
export function AuditLogExplorer({ logs, query, total, counts }: AuditLogExplorerProps) {
  // Nothing recorded at all — let the table make its own case for itself.
  if (counts.all === 0 && !query.q) {
    return <AuditLogTable logs={[]} limit={AUDIT_PAGE_SIZE} />;
  }

  const pages = pageCount(total);
  const firstShown = total === 0 ? 0 : (query.page - 1) * AUDIT_PAGE_SIZE + 1;
  const lastShown = Math.min(query.page * AUDIT_PAGE_SIZE, total);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Submits on Enter. A new search always starts back on page 1, but
            keeps the picked category. */}
        <Form action="/admin/audit" role="search" className="relative w-full sm:max-w-xs">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          {/* Keyed on the query so the field resets when navigation changes
              it (Clear filters, back button) — it's uncontrolled otherwise. */}
          <Input
            key={query.q}
            type="search"
            name="q"
            defaultValue={query.q}
            maxLength={MAX_QUERY_LENGTH}
            placeholder="Search people, actions, details"
            aria-label="Search the audit log"
            className="pl-8"
          />
          {query.category !== "all" && (
            <input type="hidden" name="category" value={query.category} />
          )}
        </Form>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by action">
          {CHIPS.map((chip) => {
            const active = query.category === chip.value;
            return (
              <Link
                key={chip.value}
                href={auditHref({ q: query.q, category: chip.value, page: 1 })}
                aria-current={active ? "true" : undefined}
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
              </Link>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {total === 0
          ? "No entries match."
          : `Showing ${firstShown}–${lastShown} of ${total} ${total === 1 ? "entry" : "entries"}.`}
      </p>

      {logs.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No entries match"
          description="Nothing in the audit log matches that search and action filter."
          action={
            <Link href="/admin/audit" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Clear filters
            </Link>
          }
        />
      ) : (
        <AuditLogTable logs={logs} limit={AUDIT_PAGE_SIZE} showFooter={false} />
      )}

      {pages > 1 && (
        <nav aria-label="Audit log pages" className="flex items-center justify-between gap-4">
          <PageLink query={query} page={query.page - 1} disabled={query.page <= 1}>
            <ChevronLeft aria-hidden />
            Newer
          </PageLink>
          <p className="font-mono text-xs text-muted-foreground">
            Page {query.page} of {pages}
          </p>
          <PageLink query={query} page={query.page + 1} disabled={query.page >= pages}>
            Older
            <ChevronRight aria-hidden />
          </PageLink>
        </nav>
      )}
    </div>
  );
}

function PageLink({
  query,
  page,
  disabled,
  children,
}: {
  query: AuditQuery;
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const className = buttonVariants({ variant: "outline", size: "sm" });
  // A dead end isn't a link — render it inert rather than pointing at a page
  // that doesn't exist.
  if (disabled) {
    return (
      <span aria-disabled="true" className={cn(className, "pointer-events-none opacity-50")}>
        {children}
      </span>
    );
  }
  return (
    <Link href={auditHref({ ...query, page })} className={className}>
      {children}
    </Link>
  );
}
