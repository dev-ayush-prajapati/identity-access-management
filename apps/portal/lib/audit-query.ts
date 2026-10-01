import type { Prisma } from "@/lib/generated/prisma";

// Server-side query model for /admin/audit: the URL (?q=&category=&page=) is
// the whole state, so a filtered page is linkable and survives a refresh, and
// filtering covers the entire log instead of only the rows one page loaded.

// Actions are stored as free-form strings (ROLE_CREATED, ACCESS_REVOKED,
// AUDIT_LOG_EXPORTED, ...), never a DB enum — so everything here reads the
// trailing verb instead of matching a fixed list. A new action shipped by a
// future route lands in "other" rather than breaking the log.
export type AuditActionCategory = "created" | "updated" | "deleted" | "access" | "denied" | "other";

// "other" is deliberately not filterable: it exists so an unrecognized action
// still lands in a bucket, but nobody would think to filter for it.
export type AuditFilter = Exclude<AuditActionCategory, "other"> | "all";

export const AUDIT_FILTERS: AuditFilter[] = ["all", "created", "updated", "deleted", "access", "denied"];

export const AUDIT_PAGE_SIZE = 50;

// Long enough for any real name/email/detail fragment; stops an arbitrarily
// large string from being shipped into six ILIKE comparisons.
export const MAX_QUERY_LENGTH = 200;

export function actionVerb(action: string): string {
  const parts = action.split("_");
  return (parts[parts.length - 1] ?? "").toUpperCase();
}

export function categorizeAction(action: string): AuditActionCategory {
  switch (actionVerb(action)) {
    case "CREATED":
      return "created";
    case "UPDATED":
      return "updated";
    case "DELETED":
    // A User row is archived, never hard-deleted (see docs/rebuild-plan.md
    // Phase 3) — same category from a filter's point of view.
    case "ARCHIVED":
      return "deleted";
    case "GRANTED":
    case "REVOKED":
      return "access";
    case "DENIED":
      return "denied";
    default:
      return "other";
  }
}

export interface AuditQuery {
  q: string;
  category: AuditFilter;
  page: number;
}

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// searchParams are user input — anything unrecognized falls back to the
// default rather than erroring. `page` isn't upper-bounded here; clampPage
// does that once the real total is known.
export function parseAuditQuery(params: SearchParams): AuditQuery {
  const q = (firstValue(params.q) ?? "").trim().slice(0, MAX_QUERY_LENGTH);

  const rawCategory = firstValue(params.category);
  const category = AUDIT_FILTERS.find((filter) => filter === rawCategory) ?? "all";

  const rawPage = firstValue(params.page) ?? "";
  const page = /^\d+$/.test(rawPage) ? Math.max(1, Number(rawPage)) : 1;

  return { q, category, page };
}

// Every field the table displays is searchable, so what you can read is what
// you can search for. The `user` relation is the fallback for rows written
// before the actorName/actorEmail snapshot columns existed — same precedence
// the table itself uses.
export function auditSearchWhere(q: string): Prisma.AuditLogWhereInput {
  if (!q) return {};
  const contains = { contains: q, mode: "insensitive" } as const;
  return {
    OR: [
      { actorName: contains },
      { actorEmail: contains },
      { action: contains },
      { details: contains },
      { user: { is: { OR: [{ name: contains }, { email: contains }] } } },
    ],
  };
}

// One row per distinct action, from `prisma.auditLog.groupBy({ by: ["action"] })`.
export type ActionCount = { action: string; _count: { _all: number } };

export function tallyCategories(rows: ActionCount[]): Record<AuditFilter, number> {
  const counts: Record<AuditFilter, number> = {
    all: 0,
    created: 0,
    updated: 0,
    deleted: 0,
    access: 0,
    denied: 0,
  };
  for (const row of rows) {
    counts.all += row._count._all;
    const category = categorizeAction(row.action);
    if (category !== "other") counts[category] += row._count._all;
  }
  return counts;
}

// A category filters on the exact action strings categorizeAction puts in it
// (taken from the same groupBy the counts come from), not a LIKE pattern
// re-deriving its verb rules — so a chip's count and what clicking it shows
// can never disagree.
export function auditWhere(
  query: Pick<AuditQuery, "q" | "category">,
  actionRows: ActionCount[]
): Prisma.AuditLogWhereInput {
  const search = auditSearchWhere(query.q);
  if (query.category === "all") return search;

  const actions = actionRows
    .map((row) => row.action)
    .filter((action) => categorizeAction(action) === query.category);
  return { AND: [search, { action: { in: actions } }] };
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
}

// A page past the end (stale link, hand-edited URL) shows the last page
// rather than an empty table.
export function clampPage(page: number, total: number): number {
  return Math.min(page, pageCount(total));
}

export function auditHref({ q, category, page }: AuditQuery): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (category !== "all") params.set("category", category);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/admin/audit?${search}` : "/admin/audit";
}
