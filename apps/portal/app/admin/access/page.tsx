import { prisma } from "@/lib/prisma";
import { AccessMatrix } from "@/components/access-matrix/access-matrix";
import { PageHeader } from "@/components/shell/page-header";

// Prisma read with no direct cookies()/headers() call of its own — without
// this Next.js prerenders it at build time and serves frozen data.
export const dynamic = "force-dynamic";

export default async function AdminAccessPage() {
  const [roles, applications, access] = await Promise.all([
    prisma.role.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.application.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.roleAccess.findMany({ select: { roleId: true, applicationId: true } }),
  ]);

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Admin", href: "/admin" }, { label: "Access Matrix" }]}
        title="Access Matrix"
        description="Which applications each Role can open. Checked = that Role's Employees see the app on their dashboard."
      />
      <AccessMatrix roles={roles} applications={applications} initialAccess={access} />
    </>
  );
}
