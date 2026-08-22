import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { SignOutForm } from "@/components/auth/sign-out-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { UserType } from "@/lib/generated/prisma";

// Reads the session via auth() (cookies-backed) and queries Postgres — see
// the note on /admin, /superadmin, /dashboard: be explicit about
// force-dynamic so this doesn't regress into a static prerender.
export const dynamic = "force-dynamic";

const USER_TYPE_LABEL: Record<UserType, string> = {
  SUPERADMIN: "Super Admin",
  ADMIN: "Admin",
  EMPLOYEE: "Employee",
};

export default async function ProfilePage() {
  const session = await auth();
  const user = session?.user.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        include: { role: true },
      })
    : null;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-8">
      <div className="flex justify-end">
        <SignOutForm />
      </div>

      <div>
        <h1 className="mb-1 text-2xl font-semibold">Profile</h1>
        <p className="mb-6 text-muted-foreground">Your account information.</p>

        {!user ? (
          <p className="text-muted-foreground">Unable to load your profile.</p>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{user.name}</CardTitle>
              <CardDescription>{user.email}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between border-t pt-3">
                <span className="text-muted-foreground">Account type</span>
                <span>{USER_TYPE_LABEL[user.userType]}</span>
              </div>
              {user.userType === "EMPLOYEE" && (
                <div className="flex justify-between border-t pt-3">
                  <span className="text-muted-foreground">Role</span>
                  <span>{user.role?.name ?? "Not assigned — contact your Admin"}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-3">
                <span className="text-muted-foreground">Member since</span>
                <span>{new Date(user.createdAt).toLocaleDateString()}</span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
