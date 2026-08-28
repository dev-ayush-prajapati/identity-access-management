import { prisma } from "@/lib/prisma";
import { AuditLogTable } from "@/components/audit-log/audit-log-table";
import { PageHeader } from "@/components/shell/page-header";

// Prisma read with no direct cookies()/headers() call of its own — without
// this Next.js prerenders it at build time and serves frozen data.
export const dynamic = "force-dynamic";

// No pagination UI yet — cap the query and say so in the table footer
// instead of silently truncating.
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
      <AuditLogTable logs={auditLogs} limit={AUDIT_LOG_LIMIT} />
    </>
  );
}
