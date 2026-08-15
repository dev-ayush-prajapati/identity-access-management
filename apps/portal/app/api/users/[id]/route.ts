import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserType } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { deleteKeycloakUser } from "@/lib/keycloak-admin";
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
  if (!target || target.userType !== managedUserType(session.user.userType)) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await req.json();
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

  await logAudit(session.user.id, `${target.userType}_UPDATED`, `Updated ${target.userType.toLowerCase()} "${user.name}"`);

  return NextResponse.json(user);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireUserType(["SUPERADMIN", "ADMIN"]);
  if (error) return error;
  const { id } = await params;

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || target.userType !== managedUserType(session.user.userType)) {
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

  await prisma.user.delete({ where: { id } });

  await logAudit(session.user.id, `${target.userType}_DELETED`, `Deleted ${target.userType.toLowerCase()} "${target.name}" (${target.email})`);

  return NextResponse.json({ success: true });
}
