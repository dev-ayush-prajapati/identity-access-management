import Link from "next/link";
import { AppWindow, Grid3x3, Shield, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { AuditLogTable } from "@/components/audit-log/audit-log-table";
import { PageHeader } from "@/components/shell/page-header";
import { StatCard } from "@/components/stats/stat-card";
import {
  ActivityChart,
  activityWindowStart,
  bucketActivityByDay,
} from "@/components/stats/activity-chart";
import { SetupChecklist } from "@/components/onboarding/setup-checklist";

// This page has no direct call to a dynamic API (cookies/headers), so
// Next.js would otherwise treat it as static and prerender it once at
// build time — real Postgres data would never update after that.
export const dynamic = "force-dynamic";

// The overview shows just enough recent activity to be useful as a landing
// page; the full log lives on /admin/audit.
const RECENT_ACTIVITY_LIMIT = 5;

export default async function AdminOverviewPage() {
  const [
    roleCount,
    employeeCount,
    applicationCount,
    grantCount,
    recentActivity,
    windowActivity,
  ] = await Promise.all([
    prisma.role.count(),
    prisma.user.count({ where: { userType: "EMPLOYEE" } }),
    prisma.application.count(),
    prisma.roleAccess.count(),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: RECENT_ACTIVITY_LIMIT,
      include: { user: { select: { name: true, email: true } } },
    }),
    // Timestamps only — the buckets are counted in JS, so nothing else is
    // worth pulling across.
    prisma.auditLog.findMany({
      where: { createdAt: { gte: activityWindowStart() } },
      select: { createdAt: true },
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
        <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            className="animate-fade-up"
            icon={Shield}
            label="Roles"
            value={roleCount}
            hint="Employees inherit access through these."
            href="/admin/roles"
          />
          <StatCard
            className="animate-fade-up"
            icon={Users}
            label="Employees"
            value={employeeCount}
            hint="Each one carries a single role."
            href="/admin/employees"
          />
          <StatCard
            className="animate-fade-up"
            icon={AppWindow}
            label="Applications"
            value={applicationCount}
            hint="The catalog belongs to Super Admin."
          />
          <StatCard
            className="animate-fade-up"
            icon={Grid3x3}
            label="Access grants"
            value={grantCount}
            hint="Role and application pairs switched on."
            href="/admin/access"
          />
        </div>

        <div className="stagger grid gap-4 lg:grid-cols-2">
          <SetupChecklist
            className="animate-fade-up"
            title="Set up access"
            steps={[
              {
                label: "Create a role",
                description:
                  "Access is granted to roles, never to people directly, so nothing can be handed out until one exists.",
                href: "/admin/roles",
                cta: "Create a role",
                done: roleCount > 0,
              },
              {
                label: "Add an employee",
                description:
                  "An employee gets exactly one role, and that role is what decides everything they see.",
                href: "/admin/employees",
                cta: "Add an employee",
                done: employeeCount > 0,
              },
              {
                label: "Grant access",
                description:
                  "Switching on a role and application pair is what makes that app appear on an employee's dashboard.",
                href: "/admin/access",
                cta: "Grant access",
                done: grantCount > 0,
              },
            ]}
          />

          <ActivityChart
            className="animate-fade-up"
            days={bucketActivityByDay(windowActivity)}
          />
        </div>

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
