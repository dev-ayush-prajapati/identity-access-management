import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { prisma } from "@/lib/prisma";
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

  if (current.status === "DISABLED") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  if (!allowed.includes(current.userType)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return {
    session: {
      ...session,
      user: { ...session.user, userType: current.userType, roleId: current.roleId },
    },
  };
}
