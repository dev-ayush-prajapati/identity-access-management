import { prisma } from "@/lib/prisma";
import { UsersManager } from "@/components/users/users-manager";
import { PageHeader } from "@/components/shell/page-header";

// Prisma read with no direct cookies()/headers() call of its own — without
// this Next.js prerenders it at build time and serves frozen data.
export const dynamic = "force-dynamic";

export default async function AdminEmployeesPage() {
  // Roles are needed for the role picker in the create/edit dialog, not just
  // for display.
  const [employees, roles] = await Promise.all([
    prisma.user.findMany({
      where: { userType: "EMPLOYEE" },
      include: { role: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.role.findMany({ orderBy: { createdAt: "asc" } }),
  ]);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Employees" }]}
        title="Employees"
        description="Employee accounts. Each gets a Keycloak login (temp password, forced reset on first login) and a Role that decides their dashboard apps."
      />
      <UsersManager initialUsers={employees} targetUserType="EMPLOYEE" roles={roles} />
    </>
  );
}
