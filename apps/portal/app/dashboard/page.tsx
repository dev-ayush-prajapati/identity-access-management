import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SignOutForm } from "@/components/auth/sign-out-form";
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
      <div className="flex justify-end">
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
            {applications.map((app) => (
              <a key={app.id} href={app.url}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardHeader>
                    <CardTitle>{app.name}</CardTitle>
                    <CardDescription>
                      {app.description || app.url}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
