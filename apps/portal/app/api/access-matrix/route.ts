import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserType } from "@/lib/api-auth";
import { logAudit, requestMeta } from "@/lib/audit";

export async function PATCH(req: NextRequest) {
  const { session, error } = await requireUserType(["ADMIN"]);
  if (error) return error;

  const body = await req.json();
  const { roleId, applicationId, granted } = body;

  if (
    typeof roleId !== "string" ||
    typeof applicationId !== "string" ||
    typeof granted !== "boolean"
  ) {
    return NextResponse.json(
      { error: "roleId, applicationId, and granted are required" },
      { status: 400 }
    );
  }

  const [role, application] = await Promise.all([
    prisma.role.findUnique({ where: { id: roleId } }),
    prisma.application.findUnique({ where: { id: applicationId } }),
  ]);

  if (!role || !application) {
    return NextResponse.json({ error: "Role or Application not found" }, { status: 404 });
  }

  // The grant/revoke and its audit row commit together or not at all — the
  // access log can't miss a change to who can open what.
  await prisma.$transaction(async (tx) => {
    if (granted) {
      await tx.roleAccess.upsert({
        where: { roleId_applicationId: { roleId, applicationId } },
        create: { roleId, applicationId },
        update: {},
      });
    } else {
      await tx.roleAccess.deleteMany({ where: { roleId, applicationId } });
    }

    await logAudit(
      {
        actorId: session.user.id,
        action: granted ? "ACCESS_GRANTED" : "ACCESS_REVOKED",
        details: `${granted ? "Granted" : "Revoked"} "${role.name}" access to "${application.name}"`,
        targetType: "RoleAccess",
        targetId: `${roleId}:${applicationId}`,
        metadata: { roleId, roleName: role.name, applicationId, applicationName: application.name, granted },
        ...requestMeta(req),
      },
      tx
    );
  });

  return NextResponse.json({ granted });
}
