import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserType } from "@/lib/api-auth";
import { logAudit } from "@/lib/audit";

const COLUMNS = ["Timestamp", "User", "Email", "Action", "Details"];

// RFC 4180 quoting. Details are admin-authored free text, so a stray comma or
// quote is normal — and an unescaped quote silently swallows the rest of the
// file when a spreadsheet parses it, which would corrupt the one record that
// is supposed to be trustworthy.
export function csvField(value: string | null | undefined): string {
  const text = value ?? "";
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(rows: (string | null | undefined)[][]): string {
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n");
}

export async function GET() {
  const { session, error } = await requireUserType(["SUPERADMIN", "ADMIN"]);
  if (error) return error;

  // Uncapped on purpose: this is the archival copy, not the on-screen view.
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true, email: true } } },
  });

  const csv = toCsv([
    COLUMNS,
    ...logs.map((log) => [
      new Date(log.createdAt).toISOString(),
      log.user?.name ?? "System",
      log.user?.email ?? "",
      log.action,
      log.details,
    ]),
  ]);

  // Reading the governance record off-platform is itself a governance event.
  // Logged after the query, so the export never contains its own entry.
  await logAudit(
    session.user.id,
    "AUDIT_LOG_EXPORTED",
    `Exported ${logs.length} audit log ${logs.length === 1 ? "entry" : "entries"} to CSV`
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="audit-log.csv"',
    },
  });
}
