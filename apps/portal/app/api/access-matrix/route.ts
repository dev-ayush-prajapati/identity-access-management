import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserType } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";

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

  if (granted) {
    await prisma.roleAccess.upsert({
      where: { roleId_applicationId: { roleId, applicationId } },
      create: { roleId, applicationId },
      update: {},
    });
  } else {
    await prisma.roleAccess.deleteMany({ where: { roleId, applicationId } });
  }

  await logAudit(
    session.user.id,
    granted ? "ACCESS_GRANTED" : "ACCESS_REVOKED",
    `${granted ? "Granted" : "Revoked"} "${role.name}" access to "${application.name}"`
  );

  return NextResponse.json({ granted });
}
