import { prisma } from "@/lib/prisma";
import { ApplicationsManager } from "@/components/applications/applications-manager";
import { UsersManager } from "@/components/users/users-manager";
import { SignOutForm } from "@/components/auth/sign-out-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { StatRow } from "@/components/stat-row";

// This page has no direct call to a dynamic API (cookies/headers), so
// Next.js would otherwise treat it as static and prerender it once at
// build time — real Postgres data would never update after that.
export const dynamic = "force-dynamic";

export default async function SuperAdminPage() {
  const [applications, admins] = await Promise.all([
    prisma.application.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.user.findMany({
      where: { userType: "ADMIN" },
      include: { role: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-12 p-8">
      <div className="flex justify-end gap-2">
        <ThemeToggle />
        <SignOutForm />
      </div>

      <StatRow
        stats={[
          { label: "Applications", value: applications.length },
          { label: "Admins", value: admins.length },
        ]}
      />

      <div>
        <h1 className="mb-1 text-2xl font-semibold">Application Catalog</h1>
        <p className="mb-6 text-muted-foreground">
          Applications registered in the system. This is what the Access
          Matrix (on the Admin dashboard) maps Roles against.
        </p>
        <ApplicationsManager initialApplications={applications} />
      </div>

      <div>
        <h1 className="mb-1 text-2xl font-semibold">Admins</h1>
        <p className="mb-6 text-muted-foreground">
          Admin accounts. Each gets a Keycloak login (temp password, forced
          reset on first login) and manages Employees, Roles, and the Access
          Matrix.
        </p>
        <UsersManager initialUsers={admins} targetUserType="ADMIN" />
      </div>
    </div>
  );
}
