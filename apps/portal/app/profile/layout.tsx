import { auth } from "@/auth";
import { AppShell } from "@/components/shell/app-shell";
import {
  ADMIN_NAV,
  EMPLOYEE_NAV,
  SUPERADMIN_NAV,
  type NavItem,
} from "@/components/shell/nav-items";
import type { UserType } from "@/lib/generated/prisma";

// /profile is the one page every tier shares, so the surrounding nav has to
// be chosen from the caller's own userType — otherwise opening Profile would
// drop the user out of their zone's navigation entirely.
const ZONE_BY_USER_TYPE: Record<UserType, { label: string; nav: NavItem[] }> = {
  SUPERADMIN: { label: "Super Admin", nav: SUPERADMIN_NAV },
  ADMIN: { label: "Admin", nav: ADMIN_NAV },
  EMPLOYEE: { label: "Employee", nav: EMPLOYEE_NAV },
};

export default async function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const zone = session?.user
    ? ZONE_BY_USER_TYPE[session.user.userType]
    : { label: "Account", nav: [] };

  return (
    <AppShell zoneLabel={zone.label} nav={zone.nav}>
      {children}
    </AppShell>
  );
}
