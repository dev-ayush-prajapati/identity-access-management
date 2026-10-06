import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserType } from "@/lib/api-auth";
import { logAudit, requestMeta } from "@/lib/audit";
import { deleteKeycloakUser, setKeycloakUserEnabled, setKeycloakUserName } from "@/lib/keycloak-admin";
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

    // The status change and its audit row commit together or not at all.
    let user;
    try {
      user = await prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id },
          data: { status },
          include: { role: true },
        });
        await logAudit(
          {
            actorId: session.user.id,
            action: status === "ACTIVE" ? `${target.userType}_ENABLED` : `${target.userType}_DISABLED`,
            details: `${status === "ACTIVE" ? "Enabled" : "Disabled"} ${target.userType.toLowerCase()} "${target.name}"`,
            targetType: "User",
            targetId: id,
            metadata: { status },
            ...requestMeta(req),
          },
          tx
        );
        return updated;
      });
    } catch (err) {
      // Compensating action, same as user create: Keycloak was already
      // flipped above, so put it back rather than leave Keycloak and Postgres
      // disagreeing about whether this account can sign in.
      try {
        await setKeycloakUserEnabled(target.keycloakId, target.status === "ACTIVE");
      } catch (rollbackErr) {
        console.error(
          `Failed to restore Keycloak enabled=${target.status === "ACTIVE"} for ${target.keycloakId} after a Postgres failure:`,
          rollbackErr
        );
      }
      console.error("Failed to update user status:", err);
      return NextResponse.json(
        { error: "Failed to update the user record; the Keycloak change was rolled back" },
        { status: 500 }
      );
    }

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

  // A rename goes to Keycloak first, same ordering as status: other apps
  // (finance-app) show Keycloak's name, not ours, so the two must not drift.
  const renamed = name !== target.name;
  if (renamed) {
    try {
      await setKeycloakUserName(target.keycloakId, name);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to update Keycloak account" },
        { status: 502 }
      );
    }
  }

  // The edit and its audit row commit together or not at all.
  let user;
  try {
    user = await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id },
        data: { name, roleId },
        include: { role: true },
      });
      await logAudit(
        {
          actorId: session.user.id,
          action: `${target.userType}_UPDATED`,
          details: `Updated ${target.userType.toLowerCase()} "${updated.name}"`,
          targetType: "User",
          targetId: id,
          metadata: { name, roleId },
          ...requestMeta(req),
        },
        tx
      );
      return updated;
    });
  } catch (err) {
    if (renamed) {
      try {
        await setKeycloakUserName(target.keycloakId, target.name);
      } catch (rollbackErr) {
        console.error(
          `Failed to restore Keycloak name "${target.name}" for ${target.keycloakId} after a Postgres failure:`,
          rollbackErr
        );
      }
    }
    console.error("Failed to update user:", err);
    return NextResponse.json(
      {
        error: renamed
          ? "Failed to update the user record; the Keycloak change was rolled back"
          : "Failed to update the user record",
      },
      { status: 500 }
    );
  }

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
  // that reference this id keep resolving instead of dangling. The archive
  // and its audit row commit together or not at all.
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { archivedAt: new Date(), status: "DISABLED" } });
      await logAudit(
        {
          actorId: session.user.id,
          action: `${target.userType}_ARCHIVED`,
          details: `Archived ${target.userType.toLowerCase()} "${target.name}" (${target.email}) — Keycloak login removed, portal record kept for audit history`,
          targetType: "User",
          targetId: id,
          metadata: { email: target.email },
          ...requestMeta(req),
        },
        tx
      );
    });
  } catch (err) {
    // A deleted Keycloak login can't be restored, so there's no compensating
    // action here — but a retry heals it: the row is still unarchived, and
    // deleteKeycloakUser treats Keycloak's 404 as already-done.
    console.error(`Keycloak login ${target.keycloakId} removed but archiving the portal row failed:`, err);
    return NextResponse.json(
      { error: "The login was removed but the portal record couldn't be archived — try again" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
