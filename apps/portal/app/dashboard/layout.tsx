import { AppShell } from "@/components/shell/app-shell";
import { EMPLOYEE_NAV } from "@/components/shell/nav-items";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell zoneLabel="Employee" nav={EMPLOYEE_NAV}>
      {children}
    </AppShell>
  );
}
