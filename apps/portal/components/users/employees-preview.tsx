import Link from "next/link";
import { Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/empty-state";
import type { Role, User } from "@/lib/generated/prisma";

type EmployeeWithRole = User & { role: Role | null };

interface EmployeesPreviewProps {
  employees: EmployeeWithRole[];
  totalCount: number;
  className?: string;
}

function initialsOf(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

// Real data, read-only — full CRUD lives at /admin/employees. This is the
// "one screen" preview the overview needs so the Admin lands on a page that
// shows people, not just counts.
export function EmployeesPreview({ employees, totalCount, className }: EmployeesPreviewProps) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Employees</CardTitle>
          <CardDescription>
            {totalCount === 0
              ? "No employees yet."
              : `${employees.length} of ${totalCount} shown, most recent first.`}
          </CardDescription>
        </div>
        <Link
          href="/admin/employees"
          className="shrink-0 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Manage
        </Link>
      </CardHeader>
      <CardContent>
        {employees.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No employees yet"
            description="Add one to see them here, then give them a role so they show up as staffed on the charts below."
          />
        ) : (
          <ul className="stagger divide-y">
            {employees.map((employee) => (
              <li key={employee.id} className="animate-fade-in flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                  {initialsOf(employee.name)}
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium">{employee.name}</span>
                  <span className="truncate text-xs text-muted-foreground">{employee.email}</span>
                </div>
                <Badge variant="outline" className="shrink-0">
                  {employee.role?.name ?? "No role"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
