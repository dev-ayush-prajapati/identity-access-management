import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserType } from "@/lib/api-auth";
import { logAudit, requestMeta } from "@/lib/audit";
import { isHttpUrl } from "@/lib/validate-url";
import { nullIfNotFound, prismaErrorCode } from "@/lib/prisma-errors";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireUserType(["SUPERADMIN"]);
  if (error) return error;
  const { id } = await params;

  const body = await req.json();
  const data: { name?: string; url?: string; description?: string | null } = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.url === "string" && body.url.trim()) data.url = body.url.trim();
  if (typeof body.description === "string") data.description = body.description.trim() || null;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  if (data.url && !isHttpUrl(data.url)) {
    return NextResponse.json({ error: "url must be a valid http(s) URL" }, { status: 400 });
  }

  let application;
  try {
    application = await prisma.application.update({ where: { id }, data });
  } catch (err) {
    const code = prismaErrorCode(err);
    if (code === "P2025") {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }
    // Same answer POST gives — the unique index on Application.name is the
    // check, so there's no read-then-write race to lose.
    if (code === "P2002") {
      return NextResponse.json(
        { error: "An application with this name already exists" },
        { status: 409 }
      );
    }
    throw err;
  }

  await logAudit({
    actorId: session.user.id,
    action: "APPLICATION_UPDATED",
    details: `Updated application "${application.name}"`,
    targetType: "Application",
    targetId: id,
    metadata: data,
    ...requestMeta(req),
  });

  return NextResponse.json(application);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireUserType(["SUPERADMIN"]);
  if (error) return error;
  const { id } = await params;

  const rolesWithAccess = await prisma.roleAccess.count({ where: { applicationId: id } });
  if (rolesWithAccess > 0) {
    return NextResponse.json(
      {
        error: `${rolesWithAccess} role(s) have access to this application. Revoke access in the Access Matrix before deleting it.`,
      },
      { status: 409 }
    );
  }

  const application = await prisma.application.delete({ where: { id } }).catch(nullIfNotFound);

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  await logAudit({
    actorId: session.user.id,
    action: "APPLICATION_DELETED",
    details: `Deleted application "${application.name}"`,
    targetType: "Application",
    targetId: id,
    metadata: { name: application.name },
    ...requestMeta(req),
  });

  return NextResponse.json({ success: true });
}
