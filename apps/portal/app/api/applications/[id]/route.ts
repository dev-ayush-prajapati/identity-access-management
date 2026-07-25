import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserType } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";

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

  const application = await prisma.application
    .update({ where: { id }, data })
    .catch(() => null);

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  await logAudit(
    session.user.id,
    "APPLICATION_UPDATED",
    `Updated application "${application.name}"`
  );

  return NextResponse.json(application);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireUserType(["SUPERADMIN"]);
  if (error) return error;
  const { id } = await params;

  const application = await prisma.application.delete({ where: { id } }).catch(() => null);

  if (!application) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 });
  }

  await logAudit(
    session.user.id,
    "APPLICATION_DELETED",
    `Deleted application "${application.name}"`
  );

  return NextResponse.json({ success: true });
}
