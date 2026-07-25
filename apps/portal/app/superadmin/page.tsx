import { prisma } from "@/lib/prisma";
import { ApplicationsManager } from "@/components/applications/applications-manager";

export default async function SuperAdminPage() {
  const applications = await prisma.application.findMany({
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="mx-auto w-full max-w-4xl p-8">
      <h1 className="mb-1 text-2xl font-semibold">Application Catalog</h1>
      <p className="mb-6 text-muted-foreground">
        Applications registered in the system. This is what the Access Matrix
        (step 6) will map Roles against.
      </p>
      <ApplicationsManager initialApplications={applications} />
    </div>
  );
}
