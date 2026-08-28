import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shell/page-header";
import { StatRow } from "@/components/stat-row";

// This page has no direct call to a dynamic API (cookies/headers), so
// Next.js would otherwise treat it as static and prerender it once at
// build time — real Postgres data would never update after that.
export const dynamic = "force-dynamic";

export default async function SuperAdminOverviewPage() {
  const [applicationCount, adminCount, employeeCount] = await Promise.all([
    prisma.application.count(),
    prisma.user.count({ where: { userType: "ADMIN" } }),
    prisma.user.count({ where: { userType: "EMPLOYEE" } }),
  ]);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Super Admin" }, { label: "Overview" }]}
        title="Overview"
        description="The application catalog and the Admin accounts that manage everything below them."
      />

      <div className="space-y-8">
        <StatRow
          stats={[
            { label: "Applications", value: applicationCount },
            { label: "Admins", value: adminCount },
            { label: "Employees", value: employeeCount },
          ]}
        />

        <div className="rounded-lg border p-6 text-sm text-muted-foreground">
          <p className="mb-2 font-medium text-foreground">What this zone controls</p>
          <p>
            Super Admin owns two things: which applications exist in the system, and
            who the Admins are. Roles, Employees, and the Access Matrix belong to
            Admins — one tier down — so they aren&apos;t manageable from here.
          </p>
        </div>
      </div>
    </>
  );
}
