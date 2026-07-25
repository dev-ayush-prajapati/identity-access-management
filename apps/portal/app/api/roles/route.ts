import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserType } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const { error } = await requireUserType(["SUPERADMIN", "ADMIN"]);
  if (error) return error;

  const roles = await prisma.role.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(roles);
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireUserType(["ADMIN"]);
  if (error) return error;

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const existing = await prisma.role.findUnique({ where: { name } });
  if (existing) {
    return NextResponse.json({ error: "A role with this name already exists" }, { status: 409 });
  }

  const role = await prisma.role.create({ data: { name } });

  await logAudit(session.user.id, "ROLE_CREATED", `Created role "${name}"`);

  return NextResponse.json(role, { status: 201 });
}
