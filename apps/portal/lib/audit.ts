import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma";

export type AuditOutcome = "SUCCESS" | "DENIED" | "FAILURE";

export interface AuditEntry {
  // Nullable for the one case where there's no portal account to attribute
  // to at all — e.g. a denied /api/authz/check call for a Keycloak identity
  // that was never given a User row.
  actorId: string | null;
  action: string;
  // Free-text summary, kept for the on-screen/CSV line. targetType/targetId/
  // metadata below are the structured, queryable side of the same event —
  // this replaces the old bare (userId, action, details) positional form.
  details?: string;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
  outcome?: AuditOutcome;
  ip?: string | null;
  userAgent?: string | null;
}

// actorName/actorEmail are looked up fresh here (not passed in) and snapshot
// onto the row at write time, independent of the `user` relation — so a row
// stays human-readable by name even if that user's name changes later, or
// (belt-and-suspenders) the relation itself is ever missing. One extra
// indexed lookup per audit write, negligible at this scale.
export async function logAudit(entry: AuditEntry) {
  const actor = entry.actorId
    ? await prisma.user.findUnique({ where: { id: entry.actorId }, select: { name: true, email: true } })
    : null;

  await prisma.auditLog.create({
    data: {
      userId: entry.actorId,
      actorName: actor?.name ?? null,
      actorEmail: actor?.email ?? null,
      action: entry.action,
      details: entry.details ?? null,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      metadata: entry.metadata ?? undefined,
      outcome: entry.outcome ?? "SUCCESS",
      ip: entry.ip ?? null,
      userAgent: entry.userAgent ?? null,
    },
  });
}

// Best-effort only: this app runs behind no real reverse proxy in dev
// (`next start` directly), so x-forwarded-for is usually absent and the
// request's own socket address isn't exposed to a Next.js route handler at
// all — there's no lower-level fallback to reach for. A production
// deployment behind a real proxy would populate x-forwarded-for correctly.
export function requestMeta(req: { headers: Headers }): { ip: string | null; userAgent: string | null } {
  const forwardedFor = req.headers.get("x-forwarded-for");
  const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : null;
  return { ip, userAgent: req.headers.get("user-agent") };
}
