import { Download } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { AuditLogExplorer } from "@/components/audit-log/audit-log-explorer";
import { PageHeader } from "@/components/shell/page-header";
import { buttonVariants } from "@/components/ui/button";

// Prisma read with no direct cookies()/headers() call of its own — without
// this Next.js prerenders it at build time and serves frozen data.
export const dynamic = "force-dynamic";

// No pagination UI yet — cap the query and say so in the explorer's count
// line instead of silently truncating.
const AUDIT_LOG_LIMIT = 100;

export default async function AdminAuditPage() {
  const auditLogs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: AUDIT_LOG_LIMIT,
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
            The export is uncapped — it returns the whole log, not this page's
            latest 100. */}
        <a
          href="/api/audit-log/export"
          download
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Download className="size-3.5" aria-hidden />
          Download CSV
        </a>
      </div>

      <AuditLogExplorer logs={auditLogs} limit={AUDIT_LOG_LIMIT} />
    </>
  );
}
