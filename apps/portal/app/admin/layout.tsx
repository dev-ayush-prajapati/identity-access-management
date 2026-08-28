import { AppShell } from "@/components/shell/app-shell";
import { ADMIN_NAV } from "@/components/shell/nav-items";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell zoneLabel="Admin" nav={ADMIN_NAV}>
      {children}
    </AppShell>
  );
}
