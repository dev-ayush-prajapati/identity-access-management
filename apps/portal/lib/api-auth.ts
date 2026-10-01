import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import type { UserType } from "@/lib/generated/prisma";

// Server-side gate for API routes. Middleware already protects the page
// routes, but API routes are a separate surface (not covered by the
// middleware matcher) and must check for themselves — never rely on a
// protected page being the only thing standing between a request and data.
//
// The session JWT is not trusted for authorization: it's only refreshed on
// sign-in, so a demoted/disabled/deleted user would otherwise keep acting
// under their old permissions for up to the session's full lifetime. Instead
// this re-reads userType/roleId/status from Postgres on every call — one
// indexed lookup, negligible at this scale — so a change to any of those
// takes effect on the caller's very next request, not their next login.
export async function requireUserType(
  allowed: UserType[]
): Promise<{ session: Session; error?: undefined } | { session?: undefined; error: NextResponse }> {
  const session = await auth();

  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const current = await prisma.user.findUnique({ where: { id: session.user.id } });

  // Row is gone (deleted since the token was issued) — same as no session.
  if (!current) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  // Both 403 branches below are an authenticated, identifiable caller being
  // turned away — worth an audit row. The two 401 branches above aren't: an
  // absent/stale session has no reliable actor to attribute, and logging
  // every unauthenticated hit would just be noise.
  if (current.status === "DISABLED") {
    await logAudit({
      actorId: session.user.id,
      action: "ACCESS_DENIED",
      details: "Blocked a disabled account from an API route",
      metadata: { reason: "disabled", allowed },
      outcome: "DENIED",
    });
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  if (!allowed.includes(current.userType)) {
    await logAudit({
      actorId: session.user.id,
      action: "ACCESS_DENIED",
      details: `Blocked ${current.userType} from a route requiring ${allowed.join(" or ")}`,
      metadata: { reason: "wrong_user_type", userType: current.userType, allowed },
      outcome: "DENIED",
    });
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return {
    session: {
      ...session,
      user: { ...session.user, userType: current.userType, roleId: current.roleId },
    },
  };
}
