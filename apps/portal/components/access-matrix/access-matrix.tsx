"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, Grid3x3 } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { Application, Role } from "@/lib/generated/prisma";

interface AccessMatrixProps {
  roles: Role[];
  applications: Application[];
  initialAccess: { roleId: string; applicationId: string }[];
}

function pairKey(roleId: string, applicationId: string) {
  return `${roleId}:${applicationId}`;
}

export function AccessMatrix({ roles, applications, initialAccess }: AccessMatrixProps) {
  const [access, setAccess] = useState(
    () => new Set(initialAccess.map((a) => pairKey(a.roleId, a.applicationId)))
  );
  const [pending, setPending] = useState<Set<string>>(new Set());

  // Every number on this screen comes out of the same optimistic `access` set
  // the cells read, so a total can never disagree with the grid under it.
  const { rowCounts, columnCounts, grantedTotal } = useMemo(() => {
    const rowCounts = new Map<string, number>();
    const columnCounts = new Map<string, number>();
    let grantedTotal = 0;

    for (const role of roles) {
      let rowTotal = 0;
      for (const app of applications) {
        if (!access.has(pairKey(role.id, app.id))) continue;
        rowTotal += 1;
        columnCounts.set(app.id, (columnCounts.get(app.id) ?? 0) + 1);
      }
      rowCounts.set(role.id, rowTotal);
      grantedTotal += rowTotal;
    }

    return { rowCounts, columnCounts, grantedTotal };
  }, [roles, applications, access]);

  async function toggle(roleId: string, applicationId: string, granted: boolean) {
    const key = pairKey(roleId, applicationId);

    setAccess((prev) => {
      const next = new Set(prev);
      if (granted) next.add(key);
      else next.delete(key);
      return next;
    });
    setPending((prev) => new Set(prev).add(key));

    try {
      const res = await fetch("/api/access-matrix", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleId, applicationId, granted }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? "Failed to update access");
        // Revert on failure.
        setAccess((prev) => {
          const next = new Set(prev);
          if (granted) next.delete(key);
          else next.add(key);
          return next;
        });
      }
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  if (roles.length === 0 || applications.length === 0) {
    const noRoles = roles.length === 0;
    const noApplications = applications.length === 0;

    return (
      <EmptyState
        icon={Grid3x3}
        title={
          noRoles && noApplications
            ? "Nothing to connect yet"
            : noRoles
              ? "No roles yet"
              : "No applications yet"
        }
        description={
          noRoles && noApplications
            ? "This grid needs at least one role and one application. Create a role first, then ask a Super Admin to register an application."
            : noRoles
              ? "Roles are the rows of this grid. Create one, then grant it access to the applications its employees need."
              : "Applications are the columns of this grid. Ask a Super Admin to register one — the application catalog belongs to the Super Admin tier."
        }
        // Registering an application is a Super Admin power, so when that is
        // what's missing there is nowhere to send an Admin.
        action={
          noRoles ? (
            <Link href="/admin/roles" className={buttonVariants({ variant: "outline" })}>
              Create a role
            </Link>
          ) : undefined
        }
      />
    );
  }

  const totalPossible = roles.length * applications.length;

  return (
    <div className="animate-fade-up space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p className="text-sm text-muted-foreground">
          {/* Re-keying on the value restarts the pop, so the number visibly
              ticks the moment a cell changes it. */}
          <span
            key={grantedTotal}
            className="animate-pop inline-block font-mono text-base font-medium tabular-nums text-foreground"
          >
            {grantedTotal}
          </span>{" "}
          of {totalPossible} possible grants active
        </p>

        <div className="flex items-center gap-4 font-mono text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <span
              className="inline-flex size-4 items-center justify-center rounded-sm bg-foreground text-background"
              aria-hidden
            >
              <Check className="size-3" />
            </span>
            granted
          </span>
          <span className="flex items-center gap-2">
            <span
              className="inline-block size-4 rounded-sm border border-dashed border-input"
              aria-hidden
            />
            not granted
          </span>
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        {/* .matrix-grid pairs with .matrix-toggle below: hovering one cell dims
            the rest, entirely in CSS so hover never touches React state. */}
        <Table className="matrix-grid">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky left-0 z-20 h-auto bg-card py-3 pl-4 align-bottom font-mono text-xs font-normal tracking-wider text-muted-foreground uppercase shadow-[inset_-1px_0_0_0_var(--border)]">
                Role
              </TableHead>
              {applications.map((app) => {
                const columnCount = columnCounts.get(app.id) ?? 0;
                return (
                  <TableHead key={app.id} className="h-auto min-w-32 px-3 py-3 text-center align-bottom">
                    <span className="block">{app.name}</span>
                    <span
                      key={columnCount}
                      className="animate-pop mt-1 block font-mono text-xs font-normal tabular-nums text-muted-foreground"
                    >
                      {columnCount} of {roles.length}
                    </span>
                  </TableHead>
                );
              })}
              <TableHead className="sticky right-0 z-20 h-auto bg-card py-3 pr-4 text-right align-bottom font-mono text-xs font-normal tracking-wider text-muted-foreground uppercase shadow-[inset_1px_0_0_0_var(--border)]">
                Granted
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {roles.map((role) => {
              const rowCount = rowCounts.get(role.id) ?? 0;
              return (
                <TableRow key={role.id} className="group/row hover:bg-muted">
                  {/* Opaque background, and bg-muted rather than the row's
                      default translucent hover — a see-through sticky cell
                      would show the columns sliding underneath it. */}
                  <TableCell className="sticky left-0 z-10 bg-card pl-4 font-medium shadow-[inset_-1px_0_0_0_var(--border)] transition-colors group-hover/row:bg-muted">
                    {role.name}
                  </TableCell>

                  {applications.map((app) => {
                    const key = pairKey(role.id, app.id);
                    const granted = access.has(key);
                    const isPending = pending.has(key);
                    return (
                      <TableCell key={app.id} className="px-3 text-center">
                        <button
                          type="button"
                          aria-pressed={granted}
                          aria-label={`${granted ? "Revoke" : "Grant"} ${role.name} access to ${app.name}`}
                          disabled={isPending}
                          onClick={() => toggle(role.id, app.id, !granted)}
                          className={cn(
                            "matrix-toggle inline-flex size-8 items-center justify-center rounded-md border align-middle outline-none transition-all duration-200",
                            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                            granted
                              ? "border-foreground bg-foreground text-background hover:bg-foreground/85"
                              : "border-dashed border-input hover:border-muted-foreground/60 hover:bg-muted",
                            isPending && "animate-pulse"
                          )}
                        >
                          {/* Always mounted, only scaled — swapping the icon in
                              and out would reflow the row on every toggle. */}
                          <Check
                            className={cn(
                              "size-4 transition-all duration-200",
                              granted ? "scale-100 opacity-100" : "scale-50 opacity-0"
                            )}
                            aria-hidden
                          />
                        </button>
                      </TableCell>
                    );
                  })}

                  <TableCell className="sticky right-0 z-10 bg-card pr-4 text-right shadow-[inset_1px_0_0_0_var(--border)] transition-colors group-hover/row:bg-muted">
                    <span
                      key={rowCount}
                      className="animate-pop inline-block font-mono text-xs tabular-nums text-muted-foreground"
                    >
                      {rowCount} of {applications.length}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Each toggle saves on the spot — there is no separate save step.
      </p>
    </div>
  );
}
