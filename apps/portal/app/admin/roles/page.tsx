import { prisma } from "@/lib/prisma";
import { RolesManager } from "@/components/roles/roles-manager";
import { PageHeader } from "@/components/shell/page-header";

// Prisma read with no direct cookies()/headers() call of its own — without
// this Next.js prerenders it at build time and serves frozen data.
export const dynamic = "force-dynamic";

export default async function AdminRolesPage() {
  const roles = await prisma.role.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Roles" }]}
        title="Roles"
        description="Roles decide which applications appear on an Employee's dashboard, via the Access Matrix."
      />
      <RolesManager initialRoles={roles} />
    </>
  );
}
