import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserType } from "@/lib/api-auth";
import { logAudit, requestMeta } from "@/lib/audit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireUserType(["ADMIN"]);
  if (error) return error;
  const { id } = await params;

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const role = await prisma.role.update({ where: { id }, data: { name } }).catch(() => null);

  if (!role) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  await logAudit({
    actorId: session.user.id,
    action: "ROLE_UPDATED",
    details: `Renamed role to "${name}"`,
    targetType: "Role",
    targetId: id,
    metadata: { name },
    ...requestMeta(req),
  });

  return NextResponse.json(role);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireUserType(["ADMIN"]);
  if (error) return error;
  const { id } = await params;

  const usersWithRole = await prisma.user.count({ where: { roleId: id } });
  if (usersWithRole > 0) {
    return NextResponse.json(
      {
        error: `${usersWithRole} user(s) are assigned this role. Reassign them before deleting it.`,
      },
      { status: 409 }
    );
  }

  const role = await prisma.role.delete({ where: { id } }).catch(() => null);

  if (!role) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  await logAudit({
    actorId: session.user.id,
    action: "ROLE_DELETED",
    details: `Deleted role "${role.name}"`,
    targetType: "Role",
    targetId: id,
    metadata: { name: role.name },
    ...requestMeta(req),
  });

  return NextResponse.json({ success: true });
}
