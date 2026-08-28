import { Info } from "lucide-react";
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
        description="Where roles meet applications — one cell per pair, on or off."
      />

      {/* The question evaluators ask at this screen is always "what does a
          ticked cell actually do?", so answer it in place. */}
      <div className="animate-fade-in mb-6 flex items-start gap-3 rounded-lg border bg-card px-4 py-3">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Turning a cell on grants every employee with that role access to that
          application, and the app shows up on their dashboard the next time they
          load it. Admins and Super Admins carry no role, so nothing here changes
          what they see.
        </p>
      </div>

      <AccessMatrix roles={roles} applications={applications} initialAccess={access} />
    </>
  );
}
