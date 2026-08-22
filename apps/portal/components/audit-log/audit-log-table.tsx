import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AuditLog, User } from "@/lib/generated/prisma";

type AuditLogRow = AuditLog & { user: Pick<User, "name" | "email"> | null };

interface AuditLogTableProps {
  logs: AuditLogRow[];
  limit: number;
}

// Server Component — this is a read-only view over data already queried in
// the page (no mutation, so no client-side state or API route needed).
export function AuditLogTable({ logs, limit }: AuditLogTableProps) {
  if (logs.length === 0) {
    return <p className="text-muted-foreground">No activity recorded yet.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {new Date(log.createdAt).toLocaleString()}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {log.user ? `${log.user.name} (${log.user.email})` : "System"}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{log.action}</Badge>
                </TableCell>
                <TableCell className="max-w-md truncate" title={log.details ?? undefined}>
                  {log.details ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {logs.length >= limit && (
        <p className="text-xs text-muted-foreground">Showing the latest {limit} entries.</p>
      )}
    </div>
  );
}
