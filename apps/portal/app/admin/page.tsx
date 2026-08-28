import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AuditLogTable } from "@/components/audit-log/audit-log-table";
import { PageHeader } from "@/components/shell/page-header";
import { StatRow } from "@/components/stat-row";

// This page has no direct call to a dynamic API (cookies/headers), so
// Next.js would otherwise treat it as static and prerender it once at
// build time — real Postgres data would never update after that.
export const dynamic = "force-dynamic";

// The overview shows just enough recent activity to be useful as a landing
// page; the full log lives on /admin/audit.
const RECENT_ACTIVITY_LIMIT = 5;

export default async function AdminOverviewPage() {
  const [roleCount, employeeCount, applicationCount, grantCount, recentActivity] =
    await Promise.all([
      prisma.role.count(),
      prisma.user.count({ where: { userType: "EMPLOYEE" } }),
      prisma.application.count(),
      prisma.roleAccess.count(),
      prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: RECENT_ACTIVITY_LIMIT,
        include: { user: { select: { name: true, email: true } } },
      }),
    ]);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Admin" }, { label: "Overview" }]}
        title="Overview"
        description="Roles, Employees, and the Access Matrix that connects them."
      />

      <div className="space-y-8">
        <StatRow
          stats={[
            { label: "Roles", value: roleCount },
            { label: "Employees", value: employeeCount },
            { label: "Applications", value: applicationCount },
            { label: "Access grants", value: grantCount },
          ]}
        />

        <div>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">Recent activity</h2>
              <p className="text-sm text-muted-foreground">
                The newest entries from the audit log.
              </p>
            </div>
            <Link
              href="/admin/audit"
              className="shrink-0 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              View all
            </Link>
          </div>
          <AuditLogTable logs={recentActivity} limit={RECENT_ACTIVITY_LIMIT} />
        </div>
      </div>
    </>
  );
}
