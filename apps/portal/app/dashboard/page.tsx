import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SignOutForm } from "@/components/auth/sign-out-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { isHttpUrl } from "@/lib/validate-url";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

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
    <div className="mx-auto w-full max-w-4xl space-y-6 p-8">
      <div className="flex justify-end gap-2">
        <ThemeToggle />
        <SignOutForm />
      </div>

      <div>
        <h1 className="mb-1 text-2xl font-semibold">Your Applications</h1>
        <p className="mb-6 text-muted-foreground">
          Apps your Role gives you access to. Click a tile to open it.
        </p>

        {!roleId && (
          <p className="text-muted-foreground">
            No Role assigned yet — contact your Admin.
          </p>
        )}

        {roleId && applications.length === 0 && (
          <p className="text-muted-foreground">
            Your Role doesn&apos;t have access to any applications yet —
            contact your Admin.
          </p>
        )}

        {applications.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {applications.map((app) => {
              // Defense in depth: the API also rejects non-http(s) URLs on
              // write, but don't trust existing data blindly when it's
              // about to become a clickable href.
              const safeUrl = isHttpUrl(app.url);
              const tile = (
                <Card className={safeUrl ? "transition-shadow hover:shadow-md" : "opacity-60"}>
                  <CardHeader>
                    <CardTitle>{app.name}</CardTitle>
                    <CardDescription>
                      {safeUrl
                        ? app.description || app.url
                        : "Invalid application URL — contact your Admin."}
                    </CardDescription>
                  </CardHeader>
                </Card>
              );
              return safeUrl ? (
                <a key={app.id} href={app.url}>
                  {tile}
                </a>
              ) : (
                <div key={app.id}>{tile}</div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
