import { prisma } from "@/lib/prisma";
import { ApplicationsManager } from "@/components/applications/applications-manager";
import { PageHeader } from "@/components/shell/page-header";

// Prisma read with no direct cookies()/headers() call of its own — without
// this Next.js prerenders it at build time and serves frozen data.
export const dynamic = "force-dynamic";

export default async function SuperAdminApplicationsPage() {
  const applications = await prisma.application.findMany({
    orderBy: { createdAt: "asc" },
  });

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Super Admin", href: "/superadmin" }, { label: "Applications" }]}
        title="Application Catalog"
        description="Applications registered in the system. This is what the Access Matrix (on the Admin dashboard) maps Roles against."
      />
      <ApplicationsManager initialApplications={applications} />
    </>
  );
}
