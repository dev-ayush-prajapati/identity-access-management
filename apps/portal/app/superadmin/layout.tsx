import { AppShell } from "@/components/shell/app-shell";
import { SUPERADMIN_NAV } from "@/components/shell/nav-items";

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell zoneLabel="Super Admin" nav={SUPERADMIN_NAV}>
      {children}
    </AppShell>
  );
}
