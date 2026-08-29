import {
  AppWindow,
  Grid3x3,
  LayoutDashboard,
  ScrollText,
  Shield,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { NavIconName } from "@/components/shell/nav-items";

// Name -> component map, resolved on the client. See the note in
// nav-items.ts for why the icon travels as a string.
export const NAV_ICONS: Record<NavIconName, LucideIcon> = {
  overview: LayoutDashboard,
  roles: Shield,
  employees: Users,
  access: Grid3x3,
  audit: ScrollText,
  applications: AppWindow,
  admins: UserCog,
};
