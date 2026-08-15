import { prisma } from "@/lib/prisma";
import { RolesManager } from "@/components/roles/roles-manager";
import { UsersManager } from "@/components/users/users-manager";

export default async function AdminPage() {
  const [roles, employees] = await Promise.all([
    prisma.role.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.user.findMany({
      where: { userType: "EMPLOYEE" },
      include: { role: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-12 p-8">
      <div>
        <h1 className="mb-1 text-2xl font-semibold">Roles</h1>
        <p className="mb-6 text-muted-foreground">
          Roles decide which applications appear on an Employee&apos;s dashboard,
          via the Access Matrix (step 6, next).
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
    </div>
  );
}
