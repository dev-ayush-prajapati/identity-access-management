import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserType } from "@/lib/api-auth";
import { logAudit, requestMeta } from "@/lib/audit";

// The original five columns stay first and unchanged; the structured fields
// Phase 4 added to every row are appended, so anything already reading the
// old layout keeps working.
const COLUMNS = [
  "Timestamp",
  "User",
  "Email",
  "Action",
  "Details",
  "Outcome",
  "Target Type",
  "Target ID",
  "Metadata",
  "IP",
  "User Agent",
];

// Neutralize first, then quote.
//
// Spreadsheets run a cell that starts with = + - @ (or a tab/CR) as a
// formula — OWASP "CSV injection". Names and details are admin-entered, and
// this file is the one handed to someone outside the system to open in Excel,
// so a name like =HYPERLINK(...) must arrive as text. A leading apostrophe is
// OWASP's recommended neutralizer. Leading whitespace doesn't make it safe —
// Excel ran " =HYPERLINK(...)" in testing — and the User-Agent column is
// whatever the client sent, untrimmed, so the check looks past it.
//
// Then RFC 4180 quoting: a stray comma or quote is normal in free text, and an
// unescaped quote silently swallows the rest of the file when a spreadsheet
// parses it — corrupting the one record that's supposed to be trustworthy.
export function csvField(value: string | null | undefined): string {
  let text = value ?? "";
  if (/^(\s*[=+\-@]|[\t\r])/.test(text)) text = `'${text}`;
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(rows: (string | null | undefined)[][]): string {
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n");
}

export async function GET(req: NextRequest) {
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
      log.actorName ?? log.user?.name ?? "System",
      log.actorEmail ?? log.user?.email ?? "",
      log.action,
      log.details,
      log.outcome,
      log.targetType,
      log.targetId,
      log.metadata == null ? null : JSON.stringify(log.metadata),
      log.ip,
      log.userAgent,
    ]),
  ]);

  // Reading the governance record off-platform is itself a governance event.
  // Logged after the query, so the export never contains its own entry.
  await logAudit({
    actorId: session.user.id,
    action: "AUDIT_LOG_EXPORTED",
    details: `Exported ${logs.length} audit log ${logs.length === 1 ? "entry" : "entries"} to CSV`,
    metadata: { count: logs.length },
    ...requestMeta(req),
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="audit-log.csv"',
    },
  });
}
