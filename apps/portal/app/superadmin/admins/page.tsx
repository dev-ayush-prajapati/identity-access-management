import { prisma } from "@/lib/prisma";
import { UsersManager } from "@/components/users/users-manager";
import { PageHeader } from "@/components/shell/page-header";

// Prisma read with no direct cookies()/headers() call of its own — without
// this Next.js prerenders it at build time and serves frozen data.
export const dynamic = "force-dynamic";

export default async function SuperAdminAdminsPage() {
  const admins = await prisma.user.findMany({
    where: { userType: "ADMIN" },
    include: { role: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Super Admin", href: "/superadmin" }, { label: "Admins" }]}
        title="Admins"
        description="Admin accounts. Each gets a Keycloak login (temp password, forced reset on first login) and manages Employees, Roles, and the Access Matrix."
      />
      <UsersManager initialUsers={admins} targetUserType="ADMIN" />
    </>
  );
}
