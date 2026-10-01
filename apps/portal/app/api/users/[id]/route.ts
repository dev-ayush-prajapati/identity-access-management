import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserType } from "@/lib/api-auth";
import { logAudit, requestMeta } from "@/lib/audit";
import { deleteKeycloakUser, setKeycloakUserEnabled } from "@/lib/keycloak-admin";
import type { UserType } from "@/lib/generated/prisma";

function managedUserType(callerType: UserType): UserType {
  return callerType === "SUPERADMIN" ? "ADMIN" : "EMPLOYEE";
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireUserType(["SUPERADMIN", "ADMIN"]);
  if (error) return error;
  const { id } = await params;

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || target.archivedAt || target.userType !== managedUserType(session.user.userType)) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await req.json();

  // Enable/disable is a distinct action from the name/role edit below (the
  // UI fires it from its own dropdown item, never mixed with the edit form),
  // so it's handled as its own branch rather than folded into the same
  // update call.
  if ("status" in body) {
    const status = body.status;
    if (status !== "ACTIVE" && status !== "DISABLED") {
      return NextResponse.json({ error: "status must be ACTIVE or DISABLED" }, { status: 400 });
    }

    try {
      await setKeycloakUserEnabled(target.keycloakId, status === "ACTIVE");
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to update Keycloak account" },
        { status: 502 }
      );
    }

    const user = await prisma.user.update({
      where: { id },
      data: { status },
      include: { role: true },
    });

    await logAudit({
      actorId: session.user.id,
      action: status === "ACTIVE" ? `${target.userType}_ENABLED` : `${target.userType}_DISABLED`,
      details: `${status === "ACTIVE" ? "Enabled" : "Disabled"} ${target.userType.toLowerCase()} "${target.name}"`,
      targetType: "User",
      targetId: id,
      metadata: { status },
      ...requestMeta(req),
    });

    return NextResponse.json(user);
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  let roleId = target.roleId;
  if (target.userType === "EMPLOYEE" && "roleId" in body) {
    const requestedRoleId = typeof body.roleId === "string" && body.roleId ? body.roleId : null;
    if (!requestedRoleId) {
      return NextResponse.json({ error: "roleId is required for Employees" }, { status: 400 });
    }
    const role = await prisma.role.findUnique({ where: { id: requestedRoleId } });
    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 400 });
    }
    roleId = requestedRoleId;
  }

  const user = await prisma.user.update({
    where: { id },
    data: { name, roleId },
    include: { role: true },
  });

  await logAudit({
    actorId: session.user.id,
    action: `${target.userType}_UPDATED`,
    details: `Updated ${target.userType.toLowerCase()} "${user.name}"`,
    targetType: "User",
    targetId: id,
    metadata: { name, roleId },
    ...requestMeta(req),
  });

  return NextResponse.json(user);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireUserType(["SUPERADMIN", "ADMIN"]);
  if (error) return error;
  const { id } = await params;

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || target.archivedAt || target.userType !== managedUserType(session.user.userType)) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  try {
    await deleteKeycloakUser(target.keycloakId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to delete Keycloak account" },
      { status: 502 }
    );
  }

  // Archive, not delete: the Keycloak login above is gone for good (they can
  // never sign in again), but the Postgres row is kept — disabled and
  // stripped from every user-management list — so historical AuditLog rows
  // that reference this id keep resolving instead of dangling.
  await prisma.user.update({ where: { id }, data: { archivedAt: new Date(), status: "DISABLED" } });

  await logAudit({
    actorId: session.user.id,
    action: `${target.userType}_ARCHIVED`,
    details: `Archived ${target.userType.toLowerCase()} "${target.name}" (${target.email}) — Keycloak login removed, portal record kept for audit history`,
    targetType: "User",
    targetId: id,
    metadata: { email: target.email },
    ...requestMeta(req),
  });

  return NextResponse.json({ success: true });
}
