"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
    return (
      <p className="text-muted-foreground">
        Add at least one Role and one Application before setting up access.
      </p>
    );
  }

  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Role</TableHead>
            {applications.map((app) => (
              <TableHead key={app.id} className="text-center">
                {app.name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((role) => (
            <TableRow key={role.id}>
              <TableCell className="font-medium">{role.name}</TableCell>
              {applications.map((app) => {
                const key = pairKey(role.id, app.id);
                return (
                  <TableCell key={app.id} className="text-center">
                    <Checkbox
                      checked={access.has(key)}
                      disabled={pending.has(key)}
                      onCheckedChange={(checked) => toggle(role.id, app.id, checked === true)}
                    />
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
