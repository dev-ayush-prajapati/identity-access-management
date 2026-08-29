import Link from "next/link";
import { AppWindow, KeyRound } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { AppTile } from "@/components/dashboard/app-tile";
import { buttonVariants } from "@/components/ui/button";
import { isHttpUrl } from "@/lib/validate-url";

// Reads the session via auth() (cookies-backed), which already forces
// per-request rendering — but see the note on /admin and /superadmin: be
// explicit here too so this doesn't regress if that read is ever refactored
// away.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  const roleId = session?.user.roleId ?? null;

  const applications = roleId
    ? await prisma.application.findMany({
        where: { access: { some: { roleId } } },
        orderBy: { createdAt: "asc" },
      })
    : [];

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Employee" }, { label: "My Applications" }]}
        title="Your Applications"
        description="Apps your Role gives you access to. Click a tile to open it."
      />

      {/* The two empty screens have different causes and different fixes, so
          they must not read the same: no role at all vs. a role nobody has
          granted anything to yet. */}
      {!roleId && (
        <EmptyState
          icon={KeyRound}
          title="No role assigned yet"
          description="A role is what grants access to applications. Ask your admin to assign you one, and the apps it opens will appear here."
          action={
            <Link href="/profile" className={buttonVariants({ variant: "outline" })}>
              View your account
            </Link>
          }
        />
      )}

      {roleId && applications.length === 0 && (
        <EmptyState
          icon={AppWindow}
          title="No applications yet"
          description="Your role doesn't have access to any application yet. Ask your admin to grant it access, and anything they add shows up here."
          action={
            <Link href="/profile" className={buttonVariants({ variant: "outline" })}>
              Check your role
            </Link>
          }
        />
      )}

      {applications.length > 0 && (
        <>
          <p className="mb-4 font-mono text-xs text-muted-foreground">
            {applications.length}{" "}
            {applications.length === 1 ? "application" : "applications"} granted by
            your role
          </p>

          <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {applications.map((app) => {
              // Defense in depth: the API also rejects non-http(s) URLs on
              // write, but don't trust existing data blindly when it's about
              // to become a clickable href.
              const safeUrl = isHttpUrl(app.url);
              return (
                <AppTile
                  key={app.id}
                  name={app.name}
                  description={app.description}
                  url={app.url}
                  safe={safeUrl}
                  className="animate-fade-up"
                />
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
