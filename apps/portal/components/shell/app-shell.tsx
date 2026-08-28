import Link from "next/link";
import { UserRound } from "lucide-react";
import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { SignOutForm } from "@/components/auth/sign-out-form";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarNav } from "@/components/shell/sidebar-nav";
import { CommandPalette } from "@/components/shell/command-palette";
import type { NavItem } from "@/components/shell/nav-items";
import type { UserType } from "@/lib/generated/prisma";

const USER_TYPE_LABEL: Record<UserType, string> = {
  SUPERADMIN: "Super Admin",
  ADMIN: "Admin",
  EMPLOYEE: "Employee",
};

interface AppShellProps {
  zoneLabel: string;
  nav: NavItem[];
  children: React.ReactNode;
}

// Frame for the management zones: persistent section nav on the left, account
// controls top-right, page content in the middle. Each page renders its own
// PageHeader — the shell can't derive the current page's title itself, since
// it's a Server Component with no access to the pathname.
//
// Below `md` the sidebar becomes a horizontally scrollable strip above the
// content instead of a drawer, so there's no client-side open/close state to
// manage and nothing new to install.
export async function AppShell({ zoneLabel, nav, children }: AppShellProps) {
  const session = await auth();
  const user = session?.user;

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b md:flex md:w-60 md:shrink-0 md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-2 px-4 py-4">
          <Link href="/" className="font-semibold">
            IAM Portal
          </Link>
          <Badge variant="secondary">{zoneLabel}</Badge>
        </div>

        <SidebarNav items={nav} />

        <div className="hidden border-t p-3 md:mt-auto md:block">
          <Link
            href="/profile"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          >
            <UserRound className="size-4 shrink-0" />
            Profile
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sticky so the palette trigger and account controls stay reachable
            down a long audit log; the translucent background keeps the page
            visibly scrolling underneath instead of hiding behind a solid bar. */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b bg-background/85 px-6 py-3 backdrop-blur supports-backdrop-filter:bg-background/65">
          <div className="min-w-0">
            {user && (
              <p className="truncate text-sm">
                <span className="font-medium">{user.name}</span>
                <span className="text-muted-foreground">
                  {" · "}
                  {USER_TYPE_LABEL[user.userType]}
                </span>
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* Renders its own trigger — the open state belongs to the client
                palette, not to this Server Component. */}
            <CommandPalette nav={nav} />
            <Link
              href="/profile"
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground md:hidden"
            >
              Profile
            </Link>
            <ThemeToggle />
            <SignOutForm />
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
