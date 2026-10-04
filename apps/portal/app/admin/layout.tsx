import { AppShell } from "@/components/shell/app-shell";
import { ADMIN_NAV } from "@/components/shell/nav-items";
import { requirePageUser } from "@/lib/page-auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // So nothing of this zone renders, not even the shell, for someone who
  // can't enter it. Not a substitute for each page's own call — layouts don't
  // re-run on soft navigation between sibling pages. Request-cached, so the
  // page's call costs nothing extra.
  await requirePageUser("ADMIN");

  return (
    <AppShell zoneLabel="Admin" nav={ADMIN_NAV}>
      {children}
    </AppShell>
  );
}
