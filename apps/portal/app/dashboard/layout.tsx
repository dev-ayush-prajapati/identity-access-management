import { AppShell } from "@/components/shell/app-shell";
import { EMPLOYEE_NAV } from "@/components/shell/nav-items";
import { requirePageUser } from "@/lib/page-auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Same as app/admin/layout.tsx: keeps the shell from rendering for someone
  // who can't enter; the page still calls this itself.
  await requirePageUser("EMPLOYEE");

  return (
    <AppShell zoneLabel="Employee" nav={EMPLOYEE_NAV}>
      {children}
    </AppShell>
  );
}
