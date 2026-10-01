import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

// Extracted out of auth.ts's signIn callback so this branching logic is
// unit-testable on its own — NextAuth's callback wiring itself stays
// manual-verification only, same as middleware.ts, but the actual decision
// (and the fact that it now gets logged at all) doesn't have to be.
export async function evaluateSignIn(keycloakId: string | null | undefined): Promise<boolean> {
  if (!keycloakId) return false;

  const user = await prisma.user.findUnique({ where: { keycloakId } });

  if (!user) {
    await logAudit({
      actorId: null,
      action: "LOGIN_DENIED",
      details: `Denied portal sign-in for Keycloak identity ${keycloakId} — no matching account`,
      metadata: { keycloakId, reason: "no_account" },
      outcome: "DENIED",
    });
    return false;
  }

  if (user.status !== "ACTIVE") {
    await logAudit({
      actorId: user.id,
      action: "LOGIN_DENIED",
      details: `Denied portal sign-in for "${user.name}" — account disabled`,
      metadata: { reason: "disabled" },
      outcome: "DENIED",
    });
    return false;
  }

  await logAudit({
    actorId: user.id,
    action: "LOGIN_SUCCESS",
    details: `"${user.name}" signed in`,
  });
  return true;
}
