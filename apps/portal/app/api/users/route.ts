import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserType } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { createKeycloakUser, generateTempPassword } from "@/lib/keycloak-admin";
import type { UserType } from "@/lib/generated/prisma";

// SuperAdmin manages Admins; Admin manages Employees — each caller only ever
// sees/creates the tier directly below them, so it's derived from the caller
// rather than taken as a request param.
function managedUserType(callerType: UserType): UserType {
  return callerType === "SUPERADMIN" ? "ADMIN" : "EMPLOYEE";
}

export async function GET() {
  const { session, error } = await requireUserType(["SUPERADMIN", "ADMIN"]);
  if (error) return error;

  const users = await prisma.user.findMany({
    where: { userType: managedUserType(session.user.userType) },
    include: { role: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireUserType(["SUPERADMIN", "ADMIN"]);
  if (error) return error;

  const targetType = managedUserType(session.user.userType);

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const roleId = typeof body.roleId === "string" && body.roleId ? body.roleId : null;

  if (!name || !email) {
    return NextResponse.json({ error: "name and email are required" }, { status: 400 });
  }

  if (targetType === "EMPLOYEE" && !roleId) {
    return NextResponse.json({ error: "roleId is required for Employees" }, { status: 400 });
  }

  if (roleId) {
    const role = await prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      return NextResponse.json({ error: "Role not found" }, { status: 400 });
    }
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });
  }

  const tempPassword = generateTempPassword();

  let keycloakId: string;
  try {
    keycloakId = await createKeycloakUser({ name, email, password: tempPassword });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create Keycloak account" },
      { status: 502 }
    );
  }

  const user = await prisma.user.create({
    data: {
      keycloakId,
      name,
      email,
      userType: targetType,
      roleId: targetType === "EMPLOYEE" ? roleId : null,
      createdById: session.user.id,
    },
    include: { role: true },
  });

  await logAudit(session.user.id, `${targetType}_CREATED`, `Created ${targetType.toLowerCase()} "${name}" (${email})`);

  return NextResponse.json({ ...user, tempPassword }, { status: 201 });
}
