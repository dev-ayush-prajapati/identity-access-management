import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// The policy decision point: any application that shares Keycloak identity
// with this portal (currently just finance-app) calls this to ask "does
// this Keycloak identity's Role grant it access to me?" instead of trusting
// its own session — the Access Matrix lives in this portal's Postgres, not
// in any token, so the decision has to be asked for live, on every request
// that matters, not just once at that app's own login.
//
// This is a service-to-service call, not a browser session: there is no
// Auth.js session here to check via requireUserType, so the caller
// authenticates with a shared secret instead.
export type AuthzReason =
  | "allow"
  | "no_account"
  | "disabled"
  | "wrong_user_type"
  | "no_role"
  | "no_grant"
  | "unknown_application";

function requireServiceSecret(req: NextRequest): NextResponse | null {
  const expected = process.env.AUTHZ_SERVICE_SECRET;
  if (!expected) {
    // A missing secret must never silently mean "allow everything" — it
    // means the deployment is misconfigured, and every caller should see
    // that as a hard failure instead of an open gate.
    return NextResponse.json({ error: "Service not configured" }, { status: 500 });
  }

  const header = req.headers.get("authorization");
  const provided = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const providedBuf = provided ? Buffer.from(provided) : null;
  const expectedBuf = Buffer.from(expected);
  const valid =
    !!providedBuf &&
    providedBuf.length === expectedBuf.length &&
    crypto.timingSafeEqual(providedBuf, expectedBuf);

  if (!valid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

async function decide(
  keycloakId: string,
  origin: string
): Promise<{ allow: boolean; reason: AuthzReason; userId: string | null }> {
  // Matched by the Application's registered URL, not its admin-editable
  // display name — the name is meant for humans in the catalog UI, the URL
  // is the one thing a calling app inherently knows about itself.
  const applications = await prisma.application.findMany({ where: { url: origin } });
  if (applications.length === 0) {
    return { allow: false, reason: "unknown_application", userId: null };
  }

  const user = await prisma.user.findUnique({ where: { keycloakId } });
  if (!user) {
    return { allow: false, reason: "no_account", userId: null };
  }
  if (user.status !== "ACTIVE") {
    return { allow: false, reason: "disabled", userId: user.id };
  }
  // Only Employees carry a Role, and only a Role's grants in the Access
  // Matrix decide which Applications open — this mirrors exactly what
  // /dashboard already shows an Employee, just enforced for another app.
  if (user.userType !== "EMPLOYEE") {
    return { allow: false, reason: "wrong_user_type", userId: user.id };
  }
  if (!user.roleId) {
    return { allow: false, reason: "no_role", userId: user.id };
  }

  const grant = await prisma.roleAccess.findFirst({
    where: { roleId: user.roleId, applicationId: { in: applications.map((a) => a.id) } },
  });

  return grant
    ? { allow: true, reason: "allow", userId: user.id }
    : { allow: false, reason: "no_grant", userId: user.id };
}

export async function POST(req: NextRequest) {
  const secretError = requireServiceSecret(req);
  if (secretError) return secretError;

  const body = await req.json();
  const keycloakId = typeof body.keycloakId === "string" ? body.keycloakId : "";
  const origin = typeof body.origin === "string" ? body.origin : "";
  // Distinguishes a one-time login attempt (worth an audit row) from this
  // same app re-checking on every subsequent request to catch a revoke
  // (not worth one per page view — see docs/plan.md, Phase 2).
  const trigger = body.trigger === "signIn" ? "signIn" : "revalidate";

  if (!keycloakId || !origin) {
    return NextResponse.json(
      { error: "keycloakId and origin are required" },
      { status: 400 }
    );
  }

  const decision = await decide(keycloakId, origin);

  if (trigger === "signIn" && !decision.allow) {
    await logAudit(
      decision.userId,
      "AUTHZ_DENIED",
      `Denied sign-in to application at "${origin}" — ${decision.reason}`
    );
  }

  return NextResponse.json({ allow: decision.allow, reason: decision.reason });
}
