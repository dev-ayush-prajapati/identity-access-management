import { prisma } from "@/lib/prisma";
import { RolesManager } from "@/components/roles/roles-manager";

export default async function AdminPage() {
  const roles = await prisma.role.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <div className="mx-auto w-full max-w-4xl p-8">
      <h1 className="mb-1 text-2xl font-semibold">Roles</h1>
      <p className="mb-6 text-muted-foreground">
        Roles decide which applications appear on an Employee&apos;s dashboard,
        via the Access Matrix (step 6, next).
      </p>
      <RolesManager initialRoles={roles} />
    </div>
  );
}
