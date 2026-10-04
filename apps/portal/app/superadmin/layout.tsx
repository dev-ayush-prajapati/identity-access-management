import { AppShell } from "@/components/shell/app-shell";
import { SUPERADMIN_NAV } from "@/components/shell/nav-items";
import { requirePageUser } from "@/lib/page-auth";

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  // Same as app/admin/layout.tsx: keeps the shell from rendering for someone
  // who can't enter; each page still calls this itself.
  await requirePageUser("SUPERADMIN");

  return (
    <AppShell zoneLabel="Super Admin" nav={SUPERADMIN_NAV}>
      {children}
    </AppShell>
  );
}
