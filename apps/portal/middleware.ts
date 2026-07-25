import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

// Uses the edge-safe config directly (not @/auth) — middleware runs in the
// Edge runtime and must not pull in Prisma. See auth.config.ts.
const { auth } = NextAuth(authConfig);

const ZONE_PREFIXES: Array<[string, string]> = [
  ["/superadmin", "SUPERADMIN"],
  ["/admin", "ADMIN"],
  ["/dashboard", "EMPLOYEE"],
];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  const zoneEntry = ZONE_PREFIXES.find(([prefix]) => pathname.startsWith(prefix));
  const requiresLogin = zoneEntry || pathname.startsWith("/profile");

  if (!requiresLogin) {
    return NextResponse.next();
  }

  if (!session?.user) {
    const signInUrl = new URL("/api/auth/signin", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
    return NextResponse.redirect(signInUrl);
  }

  if (zoneEntry) {
    const [, requiredType] = zoneEntry;
    if (session.user.userType !== requiredType) {
      return NextResponse.redirect(new URL("/", req.nextUrl.origin));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/superadmin/:path*", "/admin/:path*", "/dashboard/:path*", "/profile/:path*"],
};
