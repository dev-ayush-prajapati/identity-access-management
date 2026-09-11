import { prisma } from "@/lib/prisma";

// userId is nullable for the one case where there's no portal account to
// attribute to at all — e.g. a denied /api/authz/check call for a Keycloak
// identity that was never given a User row. AuditLog.userId is already
// nullable at the schema level for the same reason a deleted user's rows
// survive with no relation.
export async function logAudit(userId: string | null, action: string, details?: string) {
  await prisma.auditLog.create({ data: { userId, action, details } });
}
