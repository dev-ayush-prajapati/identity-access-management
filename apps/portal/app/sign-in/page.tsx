import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeftIcon, KeyRound } from "lucide-react";
import { auth } from "@/auth";
import { cn } from "@/lib/utils";
import { FloatingPaths } from "@/components/auth/floating-paths";

const ZONE_BY_USER_TYPE: Record<string, string> = {
  SUPERADMIN: "/superadmin",
  ADMIN: "/admin",
  EMPLOYEE: "/dashboard",
};

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slash-copper focus-visible:ring-offset-2 focus-visible:ring-offset-slash-obsidian";

// Branded stop between the landing page and Keycloak's hosted login. The only
// functional control is the one link to /api/auth/signin - this app has no
// local credentials form and no other identity providers configured, so
// there's nothing else real to put here (see docs/planning-notes.md §3:
// "single Keycloak-hosted login page, same for everyone").
export default async function SignInPage() {
  const session = await auth();
  if (session?.user) {
    redirect(ZONE_BY_USER_TYPE[session.user.userType] ?? "/profile");
  }

  return (
    <main className="bg-slash-obsidian text-slash-bone grid min-h-screen lg:grid-cols-2">
      <div className="border-slash-graphite relative hidden flex-col justify-between overflow-hidden border-r p-10 lg:flex">
        <FloatingPaths position={1} />
        <FloatingPaths position={-1} />
        <div className="from-slash-obsidian pointer-events-none absolute inset-0 bg-gradient-to-t to-transparent" />
        <div className="relative z-10 flex items-center gap-2">
          <KeyRound className="text-slash-copper size-6" />
          <span className="text-slash-paper text-xl font-semibold">IAM Portal</span>
        </div>
        <p className="text-slash-silver relative z-10 max-w-sm text-lg leading-relaxed">
          Keycloak owns who you are. This portal decides what you can reach —
          one sign-in, every connected app, nothing outside your role.
        </p>
      </div>

      <div className="relative flex flex-col justify-center p-6 sm:p-10">
        <Link
          href="/"
          className={cn(
            "text-slash-fog hover:text-slash-paper absolute top-7 left-6 inline-flex items-center gap-1.5 rounded-full text-sm transition-colors",
            focusRing
          )}
        >
          <ChevronLeftIcon className="size-4" />
          Home
        </Link>

        <div className="mx-auto w-full max-w-sm space-y-6">
          <div className="flex items-center gap-2 lg:hidden">
            <KeyRound className="text-slash-copper size-6" />
            <span className="text-slash-paper text-xl font-semibold">IAM Portal</span>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-slash-paper text-2xl font-semibold tracking-tight">
              Sign in
            </h1>
            <p className="text-slash-fog text-sm">
              Continue with your organization&apos;s Keycloak account.
            </p>
          </div>

          <div className="space-y-2">
            <Link
              href="/api/auth/signin"
              className={cn(
                "flex w-full items-center justify-center rounded-full bg-slash-paper px-6 py-3 text-sm font-medium text-black transition-transform duration-200 hover:scale-[1.02] hover:opacity-90",
                focusRing
              )}
            >
              Continue to Keycloak
            </Link>
            <p className="text-slash-fog text-center text-xs">
              Redirects to Keycloak — this app never sees your password.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
