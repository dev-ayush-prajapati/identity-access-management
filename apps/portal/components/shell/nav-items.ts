// Nav config for the two management zones. Deliberately holds only
// serializable values (strings) — these arrays are defined in Server
// Components (the zone layouts) and handed to the client SidebarNav, and a
// component reference can't cross that boundary. SidebarNav maps `icon` to
// the real lucide component via nav-icons.ts on the client side.

export type NavIconName =
  | "overview"
  | "roles"
  | "employees"
  | "access"
  | "audit"
  | "applications"
  | "admins";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIconName;
  // Zone roots (/admin, /superadmin) must match exactly, or they'd render
  // as active on every page inside the zone.
  exact?: boolean;
}

export const ADMIN_NAV: NavItem[] = [
  { href: "/admin", label: "Overview", icon: "overview", exact: true },
  { href: "/admin/roles", label: "Roles", icon: "roles" },
  { href: "/admin/employees", label: "Employees", icon: "employees" },
  { href: "/admin/access", label: "Access Matrix", icon: "access" },
  { href: "/admin/audit", label: "Audit Log", icon: "audit" },
];

export const EMPLOYEE_NAV: NavItem[] = [
  { href: "/dashboard", label: "My Applications", icon: "applications", exact: true },
];

export const SUPERADMIN_NAV: NavItem[] = [
  { href: "/superadmin", label: "Overview", icon: "overview", exact: true },
  { href: "/superadmin/applications", label: "Applications", icon: "applications" },
  { href: "/superadmin/admins", label: "Admins", icon: "admins" },
];
