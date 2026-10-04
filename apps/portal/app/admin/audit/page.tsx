import { Download } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requirePageUser } from "@/lib/page-auth";
import { AuditLogExplorer } from "@/components/audit-log/audit-log-explorer";
import { PageHeader } from "@/components/shell/page-header";
import { buttonVariants } from "@/components/ui/button";
import {
  AUDIT_PAGE_SIZE,
  auditSearchWhere,
  auditWhere,
  clampPage,
  parseAuditQuery,
  tallyCategories,
} from "@/lib/audit-query";

// Reading searchParams already makes this per-request, but stay explicit —
// see the note on /admin about the static-prerender trap.
export const dynamic = "force-dynamic";

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageUser("ADMIN");

  const query = parseAuditQuery(await searchParams);

  // One groupBy over the search-matching rows gives both the chip counts and
  // the exact action list a category filters on — and the total for the
  // current filter, so no separate count() query.
  const actionRows = await prisma.auditLog.groupBy({
    by: ["action"],
    where: auditSearchWhere(query.q),
    _count: { _all: true },
  });
  const counts = tallyCategories(actionRows);
  const total = counts[query.category];
  const page = clampPage(query.page, total);

  // ponytail: offset paging — a row written while someone is on page 2 shifts
  // every later page down by one (a repeated row at the boundary). Fine for an
  // admin viewer; switch to a (createdAt, id) cursor if the log gets large or
  // busy enough for that to matter.
  const logs = await prisma.auditLog.findMany({
    where: auditWhere(query, actionRows),
    // id breaks createdAt ties, so a row can't flip between two pages.
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * AUDIT_PAGE_SIZE,
    take: AUDIT_PAGE_SIZE,
    include: { user: { select: { name: true, email: true } } },
  });

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Audit Log" }]}
        title="Audit Log"
        description="Who did what, when — every create/update/delete in the portal writes an entry here."
      />

      <div className="mb-4 flex justify-end">
        {/* Plain <a>, not next/link: this points at an API route that answers
            with a file, so client-side navigation would only get in the way.
            The export is the whole log, unfiltered — the archival copy, not
            this view. */}
        <a
          href="/api/audit-log/export"
          download
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Download className="size-3.5" aria-hidden />
          Download CSV
        </a>
      </div>

      <AuditLogExplorer logs={logs} query={{ ...query, page }} total={total} counts={counts} />
    </>
  );
}
