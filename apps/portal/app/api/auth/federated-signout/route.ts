import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { signOut } from "@/auth";

// Auth.js's default /api/auth/signout only clears our own session cookie.
// Keycloak keeps its own SSO session alive, so the next sign-in would
// silently re-authenticate the same user with no login prompt. This route
// also ends the Keycloak session (RP-initiated / "federated" logout) via
// its end_session_endpoint, using the id_token captured at sign-in as
// id_token_hint.
export async function GET(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    cookieName: "portal-session-token",
  });

  await signOut({ redirect: false });

  const idToken = token?.idToken;
  const issuer = process.env.AUTH_KEYCLOAK_ISSUER;
  if (!idToken || !issuer) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const params = new URLSearchParams({
    id_token_hint: idToken,
    post_logout_redirect_uri: new URL("/", request.url).toString(),
  });
  return NextResponse.redirect(
    `${issuer}/protocol/openid-connect/logout?${params}`
  );
}
