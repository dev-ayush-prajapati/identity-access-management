import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

// Uses the edge-safe config directly (not @/auth) — middleware runs in the
// Edge runtime and must not pull in Prisma. See auth.config.ts.
const { auth } = NextAuth(authConfig);

// Authentication only: "is there a session at all?" — the cheap first pass
// that sends a signed-out visitor to Keycloak.
//
// Which zone someone may enter is deliberately not decided here. All this
// runtime can see is the session JWT, whose userType/status are frozen at
// sign-in — a zone check on it would keep a disabled Admin inside /admin, and
// would redirect-loop against the live check for anyone promoted or demoted
// since they signed in. Every zone page calls requirePageUser
// (lib/page-auth.ts), which reads the user from Postgres on each request;
// lib/page-auth.test.ts fails if a zone page doesn't.
export default auth((req) => {
  if (!req.auth?.user) {
    const signInUrl = new URL("/api/auth/signin", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/superadmin/:path*", "/admin/:path*", "/dashboard/:path*", "/profile/:path*"],
};
