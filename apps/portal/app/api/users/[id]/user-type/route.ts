import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserType } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";

// Promote/demote between ADMIN and SUPERADMIN. SuperAdmin-only, and
// deliberately its own route rather than folded into the general PATCH in
// ../route.ts: that route's target lookup is scoped to "one tier below the
// caller" (managedUserType), which by design can never match a SuperAdmin
// target — this one operates within the SuperAdmin's own tier instead.
// Employees are out of scope: they're a different kind of tier entirely
// (carry a Role, created by an Admin, not part of this ladder).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireUserType(["SUPERADMIN"]);
  if (error) return error;
  const { id } = await params;

  const body = await req.json();
  const userType = body.userType;
  if (userType !== "ADMIN" && userType !== "SUPERADMIN") {
    return NextResponse.json({ error: "userType must be ADMIN or SUPERADMIN" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (
    !target ||
    target.archivedAt ||
    (target.userType !== "ADMIN" && target.userType !== "SUPERADMIN")
  ) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (target.userType === userType) {
    return NextResponse.json(
      { error: `Already ${userType === "SUPERADMIN" ? "a SuperAdmin" : "an Admin"}` },
      { status: 400 }
    );
  }

  if (target.id === session.user.id) {
    return NextResponse.json({ error: "You can't change your own account type" }, { status: 400 });
  }

  if (target.userType === "SUPERADMIN" && userType === "ADMIN") {
    const superAdminCount = await prisma.user.count({
      where: { userType: "SUPERADMIN", archivedAt: null },
    });
    if (superAdminCount <= 1) {
      return NextResponse.json({ error: "Can't demote the last SuperAdmin" }, { status: 400 });
    }
  }

  const user = await prisma.user.update({
    where: { id },
    data: { userType },
    include: { role: true },
  });

  await logAudit(
    session.user.id,
    userType === "SUPERADMIN" ? "USER_PROMOTED" : "USER_DEMOTED",
    `${userType === "SUPERADMIN" ? "Promoted" : "Demoted"} "${target.name}" from ${target.userType} to ${userType}`
  );

  return NextResponse.json(user);
}
