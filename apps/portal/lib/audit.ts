import { prisma } from "@/lib/prisma";

// userId is nullable for the one case where there's no portal account to
// attribute to at all — e.g. a denied /api/authz/check call for a Keycloak
// identity that was never given a User row. AuditLog.userId is already
// nullable at the schema level for the same reason.
//
// actorName/actorEmail are looked up fresh here (not passed in) and snapshot
// onto the row at write time, independent of the `user` relation — so a row
// stays human-readable by name even if that user's name changes later, or
// (belt-and-suspenders) the relation itself is ever missing. One extra
// indexed lookup per audit write, negligible at this scale.
export async function logAudit(userId: string | null, action: string, details?: string) {
  const actor = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } })
    : null;

  await prisma.auditLog.create({
    data: {
      userId,
      actorName: actor?.name ?? null,
      actorEmail: actor?.email ?? null,
      action,
      details,
    },
  });
}
