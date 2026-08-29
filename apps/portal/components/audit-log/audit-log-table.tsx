import Link from "next/link";
import { ScrollText } from "lucide-react";
import { ActionBadge } from "@/components/audit-log/action-badge";
import { EmptyState } from "@/components/common/empty-state";
import { RelativeTime } from "@/components/common/relative-time";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AuditLog, User } from "@/lib/generated/prisma";

export type AuditLogRow = AuditLog & { user: Pick<User, "name" | "email"> | null };

interface AuditLogTableProps {
  logs: AuditLogRow[];
  limit: number;
  // The explorer shows its own live "Showing X of Y" count, so it turns this
  // off rather than stacking two different totals under the same table.
  showFooter?: boolean;
}

// Two letters at most: first and last word, so "Ayush Prajapati" reads AP and
// a mononym still gets a monogram instead of an empty circle.
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

// Server Component — this is a read-only view over data already queried in
// the page (no mutation, so no client-side state or API route needed).
export function AuditLogTable({ logs, limit, showFooter = true }: AuditLogTableProps) {
  if (logs.length === 0) {
    return (
      <EmptyState
        icon={ScrollText}
        title="No activity recorded yet"
        description="Every role, employee, application, and access change writes a line here. Make one and it shows up immediately."
        action={
          <Link href="/admin/roles" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Manage roles
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Who</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Details</TableHead>
              <TableHead className="text-right">When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="stagger">
            {logs.map((log) => (
              <TableRow key={log.id} className="animate-fade-in">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-[0.65rem] font-medium text-muted-foreground"
                    >
                      {log.user ? initialsOf(log.user.name) : "SY"}
                    </span>
                    <span className="flex flex-col leading-tight">
                      <span className="font-medium">{log.user?.name ?? "System"}</span>
                      <span className="text-xs text-muted-foreground">
                        {log.user?.email ?? "No linked account"}
                      </span>
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <ActionBadge action={log.action} />
                </TableCell>
                <TableCell
                  className="max-w-md truncate text-muted-foreground"
                  title={log.details ?? undefined}
                >
                  {log.details ?? "—"}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  <RelativeTime date={log.createdAt} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {showFooter && logs.length >= limit && (
        <p className="text-xs text-muted-foreground">Showing the latest {limit} entries.</p>
      )}
    </div>
  );
}
