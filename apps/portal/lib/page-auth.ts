import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import type { UserStatus, UserType } from "@/lib/generated/prisma";

// Page-side twin of lib/api-auth.ts's requireUserType. Every page under a
// zone (/superadmin, /admin, /dashboard, /profile) calls requirePageUser
// first — enforced by lib/page-auth.test.ts, which fails if a zone page
// doesn't.
//
// The session JWT's userType/status are frozen at sign-in (Auth.js default
// session: 30 days), so they can't decide anything: a disabled Admin would
// keep reading the employee list and audit log, and a promoted one would be
// routed to the wrong zone, until they re-logged in. This reads the row live
// on every request instead. middleware.ts only checks that a session exists
// — it runs in the Edge runtime with no database, and a zone check there on
// the stale token would redirect-loop against this one.

export const ZONE_HOME: Record<UserType, string> = {
  SUPERADMIN: "/superadmin",
  ADMIN: "/admin",
  EMPLOYEE: "/dashboard",
};

// A zone is the one userType allowed in, or ANY for pages every signed-in,
// active user shares (/profile).
export type PageZone = UserType | "ANY";

export type PageAccess =
  | { allow: true }
  | { allow: false; redirectTo: string; reason: "no_account" | "disabled" | "wrong_user_type" };

// Pure, so the decision is unit-testable without rendering anything.
// Disabled/archived and missing accounts go to "/", which (via this same
// check) renders the signed-out landing page instead of bouncing them back;
// an active user in the wrong zone goes to their own.
export function decidePageAccess(
  user: { userType: UserType; status: UserStatus; archivedAt: Date | null } | null,
  zone: PageZone
): PageAccess {
  if (!user) return { allow: false, redirectTo: "/", reason: "no_account" };
  if (user.status !== "ACTIVE" || user.archivedAt) {
    return { allow: false, redirectTo: "/", reason: "disabled" };
  }
  if (zone !== "ANY" && user.userType !== zone) {
    return { allow: false, redirectTo: ZONE_HOME[user.userType], reason: "wrong_user_type" };
  }
  return { allow: true };
}

// The signed-in user's row, live. cache() memoizes it per request, so the
// shell, the layout, and the page asking cost one query between them.
export const getLiveUser = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;
  return prisma.user.findUnique({ where: { id: session.user.id }, include: { role: true } });
});

// Cached on `zone` (a string, so it actually hits) — a layout and its page
// both calling this log a blocked attempt once, not twice.
export const requirePageUser = cache(async (zone: PageZone) => {
  const user = await getLiveUser();
  const access = decidePageAccess(user, zone);

  if (!access.allow) {
    // Same reasoning as requireUserType: an identifiable, disabled caller
    // being turned away is worth a row (a leaver still trying to get in);
    // routing an active user to their own zone is just navigation.
    if (user && access.reason === "disabled") {
      await logAudit({
        actorId: user.id,
        action: "ACCESS_DENIED",
        details: `Blocked a disabled account from the ${zone === "ANY" ? "account" : zone.toLowerCase()} pages`,
        metadata: { reason: "disabled", zone },
        outcome: "DENIED",
      });
    }
    redirect(access.redirectTo);
  }

  // decidePageAccess never allows a null user.
  return user!;
});
