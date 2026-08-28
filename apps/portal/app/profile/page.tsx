import { Check } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
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

// Two lines per tier, phrased as what the person can do rather than which
// screens exist — this is the one place a user learns why their account looks
// different from a colleague's.
const CAPABILITIES: Record<UserType, [string, string]> = {
  SUPERADMIN: [
    "Manage the catalog of applications the organization draws from.",
    "Create and remove admin accounts.",
  ],
  ADMIN: [
    "Create roles and employee accounts.",
    "Decide which applications each role can open, in the access matrix.",
  ],
  EMPLOYEE: [
    "Open the applications your role grants you, from your dashboard.",
    "Ask your admin when you need access to something that isn't there.",
  ],
};

// First and last word of the name — "Ada Lovelace" → AL.
function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters =
    words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0][0];
  return letters.toUpperCase();
}

export default async function ProfilePage() {
  const session = await auth();
  const user = session?.user.id
    ? await prisma.user.findUnique({
        where: { id: session.user.id },
        include: { role: true },
      })
    : null;

  // Admins and SuperAdmins carry no Role by design — a Role only decides which
  // applications an Employee sees. Saying "none" here would read as something
  // an admin forgot to set.
  const roleValue = !user
    ? null
    : user.userType === "EMPLOYEE"
      ? (user.role?.name ?? "Not assigned yet — ask your admin")
      : "Not applicable — admins don't carry a role";

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: "Account" }, { label: "Profile" }]}
        title="Profile"
        description="Your account information."
      />

      {!user ? (
        <p className="text-muted-foreground">Unable to load your profile.</p>
      ) : (
        <div className="stagger max-w-2xl space-y-4">
          <Card className="animate-fade-up">
            <CardHeader className="flex items-center gap-5">
              <div
                className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-muted font-mono text-xl font-medium text-muted-foreground"
                aria-hidden
              >
                {initials(user.name)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-xl font-semibold">{user.name}</p>
                <p className="truncate text-muted-foreground">{user.email}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge variant="secondary">
                    {USER_TYPE_LABEL[user.userType]}
                  </Badge>
                  {user.userType === "EMPLOYEE" && user.role && (
                    <Badge variant="outline">{user.role.name}</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
          </Card>

          <Card className="animate-fade-up">
            <CardHeader>
              <CardTitle>Account details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-border text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2 pb-2.5">
                  <dt className="text-muted-foreground">Account type</dt>
                  <dd>{USER_TYPE_LABEL[user.userType]}</dd>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
                  <dt className="text-muted-foreground">Role</dt>
                  <dd className="text-right">{roleValue}</dd>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-2 pt-2.5">
                  <dt className="text-muted-foreground">Member since</dt>
                  <dd>{new Date(user.createdAt).toLocaleDateString()}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card className="animate-fade-up">
            <CardHeader>
              <CardTitle>What your account can do</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5 text-sm">
                {CAPABILITIES[user.userType].map((line) => (
                  <li key={line} className="flex gap-2.5">
                    <Check
                      className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
