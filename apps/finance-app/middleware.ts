import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { checkAccess } from "@/lib/authz-check";

// signIn (in auth.ts) only runs once, at login — on its own that's exactly
// the staleness bug the portal itself had before its Phase 1 fix (see
// docs/session-log.md): a role change or a revoked grant wouldn't take
// effect until the next login. This re-asks the portal's Access Matrix on
// every request to the one protected page instead, so a revoke locks this
// app out on its very next request.
//
// No Prisma import here either — this still has to be safe to run in the
// Edge runtime, same reasoning as the portal's middleware.ts, but the
// constraint is trivially satisfied since this file only ever calls fetch.
export default auth(async (req) => {
  const session = req.auth;

  if (!session?.user?.keycloakId) {
    // Not signed in — the page itself redirects to /api/auth/signin.
    return NextResponse.next();
  }

  const decision = await checkAccess(session.user.keycloakId, "revalidate");
  if (!decision.allow) {
    return NextResponse.redirect(new URL("/access-denied", req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/"],
};
