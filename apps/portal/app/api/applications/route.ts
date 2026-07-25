import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserType } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";

export async function GET() {
  const { error } = await requireUserType(["SUPERADMIN", "ADMIN"]);
  if (error) return error;

  const applications = await prisma.application.findMany({
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json(applications);
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireUserType(["SUPERADMIN"]);
  if (error) return error;

  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const url = typeof body.url === "string" ? body.url.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim() || null : null;

  if (!name || !url) {
    return NextResponse.json({ error: "name and url are required" }, { status: 400 });
  }

  const existing = await prisma.application.findUnique({ where: { name } });
  if (existing) {
    return NextResponse.json(
      { error: "An application with this name already exists" },
      { status: 409 }
    );
  }

  const application = await prisma.application.create({
    data: { name, url, description },
  });

  await logAudit(session.user.id, "APPLICATION_CREATED", `Created application "${name}"`);

  return NextResponse.json(application, { status: 201 });
}
