// This app has no database and no business logic — Postgres, where Role x
// Application access actually lives, belongs entirely to the portal. So
// every access decision here is delegated to the portal's policy-decision
// endpoint, live, rather than inferred from anything in this app's own
// session token. See app/api/authz/check/route.ts in the portal.
const PORTAL_URL = "http://localhost:3000";
const THIS_APP_URL = "http://localhost:3001";

export type AccessDecision = { allow: boolean; reason: string };

export async function checkAccess(
  keycloakId: string,
  trigger: "signIn" | "revalidate"
): Promise<AccessDecision> {
  try {
    const res = await fetch(`${PORTAL_URL}/api/authz/check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.AUTHZ_SERVICE_SECRET}`,
      },
      body: JSON.stringify({ keycloakId, origin: THIS_APP_URL, trigger }),
      cache: "no-store",
    });

    if (!res.ok) {
      return { allow: false, reason: "portal_unreachable" };
    }

    const data = await res.json();
    return {
      allow: data.allow === true,
      reason: typeof data.reason === "string" ? data.reason : "unknown",
    };
  } catch {
    // A network blip or the portal being down must never look like a grant.
    return { allow: false, reason: "portal_unreachable" };
  }
}
