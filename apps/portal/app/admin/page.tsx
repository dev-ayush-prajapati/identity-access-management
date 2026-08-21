import { prisma } from "@/lib/prisma";
import { RolesManager } from "@/components/roles/roles-manager";
import { UsersManager } from "@/components/users/users-manager";
import { AccessMatrix } from "@/components/access-matrix/access-matrix";
import { AuditLogTable } from "@/components/audit-log/audit-log-table";
import { SignOutForm } from "@/components/auth/sign-out-form";

// This page has no direct call to a dynamic API (cookies/headers), so
// Next.js would otherwise treat it as static and prerender it once at
// build time — real Postgres data would never update after that.
export const dynamic = "force-dynamic";

// No pagination UI yet — cap the query and say so in the table footer
// instead of silently truncating.
const AUDIT_LOG_LIMIT = 100;

export default async function AdminPage() {
  const [roles, employees, applications, access, auditLogs] = await Promise.all([
    prisma.role.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.user.findMany({
      where: { userType: "EMPLOYEE" },
      include: { role: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.application.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.roleAccess.findMany({ select: { roleId: true, applicationId: true } }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: AUDIT_LOG_LIMIT,
      include: { user: { select: { name: true, email: true } } },
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-12 p-8">
      <div className="flex justify-end">
        <SignOutForm />
      </div>

      <div>
        <h1 className="mb-1 text-2xl font-semibold">Roles</h1>
        <p className="mb-6 text-muted-foreground">
          Roles decide which applications appear on an Employee&apos;s dashboard,
          via the Access Matrix below.
        </p>
        <RolesManager initialRoles={roles} />
      </div>

      <div>
        <h1 className="mb-1 text-2xl font-semibold">Employees</h1>
        <p className="mb-6 text-muted-foreground">
          Employee accounts. Each gets a Keycloak login (temp password, forced
          reset on first login) and a Role that decides their dashboard apps.
        </p>
        <UsersManager initialUsers={employees} targetUserType="EMPLOYEE" roles={roles} />
      </div>

      <div>
        <h1 className="mb-1 text-2xl font-semibold">Access Matrix</h1>
        <p className="mb-6 text-muted-foreground">
          Which applications each Role can open. Checked = that Role&apos;s
          Employees see the app on their dashboard.
        </p>
        <AccessMatrix roles={roles} applications={applications} initialAccess={access} />
      </div>

      <div>
        <h1 className="mb-1 text-2xl font-semibold">Audit Log</h1>
        <p className="mb-6 text-muted-foreground">
          Who did what, when — every create/update/delete above writes an entry here.
        </p>
        <AuditLogTable logs={auditLogs} limit={AUDIT_LOG_LIMIT} />
      </div>
    </div>
  );
}
