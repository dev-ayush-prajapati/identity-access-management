import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserType } from "@/lib/api-auth";
import { logAudit, requestMeta } from "@/lib/audit";
import { nullIfNotFound, prismaErrorCode } from "@/lib/prisma-errors";

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

  // The rename and its audit row commit together or not at all.
  let role;
  try {
    role = await prisma.$transaction(async (tx) => {
      const updated = await tx.role.update({ where: { id }, data: { name } });
      await logAudit(
        {
          actorId: session.user.id,
          action: "ROLE_UPDATED",
          details: `Renamed role to "${name}"`,
          targetType: "Role",
          targetId: id,
          metadata: { name },
          ...requestMeta(req),
        },
        tx
      );
      return updated;
    });
  } catch (err) {
    const code = prismaErrorCode(err);
    if (code === "P2025") {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }
    // Same answer POST gives — the unique index on Role.name is the check, so
    // there's no read-then-write race to lose.
    if (code === "P2002") {
      return NextResponse.json({ error: "A role with this name already exists" }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json(role);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireUserType(["ADMIN"]);
  if (error) return error;
  const { id } = await params;

  // Archived users keep their roleId (the row survives for audit history) but
  // can't be seen or reassigned, so counting them would block this forever.
  // Deleting the role nulls their roleId via the FK's default SetNull.
  const usersWithRole = await prisma.user.count({ where: { roleId: id, archivedAt: null } });
  if (usersWithRole > 0) {
    return NextResponse.json(
      {
        error: `${usersWithRole} user(s) are assigned this role. Reassign them before deleting it.`,
      },
      { status: 409 }
    );
  }

  // The delete and its audit row commit together or not at all.
  const role = await prisma.$transaction(async (tx) => {
    const deleted = await tx.role.delete({ where: { id } }).catch(nullIfNotFound);
    if (deleted) {
      await logAudit(
        {
          actorId: session.user.id,
          action: "ROLE_DELETED",
          details: `Deleted role "${deleted.name}"`,
          targetType: "Role",
          targetId: id,
          metadata: { name: deleted.name },
          ...requestMeta(req),
        },
        tx
      );
    }
    return deleted;
  });

  if (!role) {
    return NextResponse.json({ error: "Role not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
