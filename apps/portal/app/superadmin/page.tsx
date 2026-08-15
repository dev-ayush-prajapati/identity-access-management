import { prisma } from "@/lib/prisma";
import { ApplicationsManager } from "@/components/applications/applications-manager";
import { UsersManager } from "@/components/users/users-manager";

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
      <div>
        <h1 className="mb-1 text-2xl font-semibold">Application Catalog</h1>
        <p className="mb-6 text-muted-foreground">
          Applications registered in the system. This is what the Access Matrix
          (step 6) will map Roles against.
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
