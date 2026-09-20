import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserType } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";
import { generateTempPassword, resetKeycloakUserPassword } from "@/lib/keycloak-admin";
import type { UserType } from "@/lib/generated/prisma";

function managedUserType(callerType: UserType): UserType {
  return callerType === "SUPERADMIN" ? "ADMIN" : "EMPLOYEE";
}

// Forced password reset: an Admin/SuperAdmin generates a new temp password
// for someone in their tier (lost device, suspected compromise, etc.) — same
// one-time-display pattern as creating the account in the first place.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireUserType(["SUPERADMIN", "ADMIN"]);
  if (error) return error;
  const { id } = await params;

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || target.archivedAt || target.userType !== managedUserType(session.user.userType)) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const tempPassword = generateTempPassword();

  try {
    await resetKeycloakUserPassword(target.keycloakId, tempPassword);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to reset Keycloak password" },
      { status: 502 }
    );
  }

  await logAudit(
    session.user.id,
    `${target.userType}_PASSWORD_RESET`,
    `Forced a password reset for ${target.userType.toLowerCase()} "${target.name}"`
  );

  return NextResponse.json({ tempPassword });
}
