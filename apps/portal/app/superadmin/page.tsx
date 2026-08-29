import { AppWindow, Shield, UserCog, Users } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shell/page-header";
import { StatCard } from "@/components/stats/stat-card";
import {
  ActivityChart,
  activityWindowStart,
  bucketActivityByDay,
} from "@/components/stats/activity-chart";
import { SetupChecklist } from "@/components/onboarding/setup-checklist";
import { Card, CardContent } from "@/components/ui/card";

// This page has no direct call to a dynamic API (cookies/headers), so
// Next.js would otherwise treat it as static and prerender it once at
// build time — real Postgres data would never update after that.
export const dynamic = "force-dynamic";

export default async function SuperAdminOverviewPage() {
  const [applicationCount, adminCount, employeeCount, windowActivity] =
    await Promise.all([
      prisma.application.count(),
      prisma.user.count({ where: { userType: "ADMIN" } }),
      prisma.user.count({ where: { userType: "EMPLOYEE" } }),
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
        breadcrumb={[{ label: "Super Admin" }, { label: "Overview" }]}
        title="Overview"
        description="The application catalog and the Admin accounts that manage everything below them."
      />

      <div className="space-y-8">
        <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            className="animate-fade-up"
            icon={AppWindow}
            label="Applications"
            value={applicationCount}
            hint="The catalog every role draws from."
            href="/superadmin/applications"
          />
          <StatCard
            className="animate-fade-up"
            icon={UserCog}
            label="Admins"
            value={adminCount}
            hint="They run roles, employees, and access."
            href="/superadmin/admins"
          />
          <StatCard
            className="animate-fade-up"
            icon={Users}
            label="Employees"
            value={employeeCount}
            hint="Added by Admins, one tier down."
          />
        </div>

        <div className="stagger grid gap-4 lg:grid-cols-2">
          {/* Two steps only. A third "the Admin takes it from here" entry would
              be a step that never completes — it would either hold the call to
              action forever or stop the list from ever collapsing. That handoff
              is the explainer card's job instead. */}
          <SetupChecklist
            className="animate-fade-up"
            title="Set up the system"
            steps={[
              {
                label: "Register an application",
                description:
                  "Nothing can be granted to anyone until the catalog has something in it.",
                href: "/superadmin/applications",
                cta: "Register an application",
                done: applicationCount > 0,
              },
              {
                label: "Create an admin",
                description:
                  "Roles, employees, and the Access Matrix are an Admin's job — this is who picks it up.",
                href: "/superadmin/admins",
                cta: "Create an admin",
                done: adminCount > 0,
              },
            ]}
          />

          <ActivityChart
            className="animate-fade-up"
            days={bucketActivityByDay(windowActivity)}
          />
        </div>

        <Card>
          <CardContent className="flex items-start gap-3">
            <Shield className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div>
              <p className="font-medium">What this zone controls</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Super Admin owns two things: which applications exist in the system,
                and who the Admins are. Roles, Employees, and the Access Matrix
                belong to Admins — one tier down — so they aren&apos;t manageable
                from here.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
