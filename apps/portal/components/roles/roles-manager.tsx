"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MoreHorizontal, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import GradientButton from "@/components/kokonutui/gradient-button";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Role } from "@/lib/generated/prisma";

interface RolesManagerProps {
  initialRoles: Role[];
}

export function RolesManager({ initialRoles }: RolesManagerProps) {
  const router = useRouter();
  const [roles, setRoles] = useState(initialRoles);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Two pieces of state, not one nullable target: the dialog stays mounted
  // through its close animation, so clearing the target on close would blank
  // the role's name mid-fade.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);

  function openCreateDialog() {
    setEditingId(null);
    setName("");
    setDialogOpen(true);
  }

  function openEditDialog(role: Role) {
    setEditingId(role.id);
    setName(role.name);
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(editingId ? `/api/roles/${editingId}` : "/api/roles", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Something went wrong");
        return;
      }

      if (editingId) {
        setRoles((prev) => prev.map((r) => (r.id === editingId ? data : r)));
        toast.success("Role updated");
      } else {
        setRoles((prev) => [...prev, data]);
        toast.success("Role created");
      }
      setDialogOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  function requestDelete(role: Role) {
    setDeleteTarget(role);
    setConfirmOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const role = deleteTarget;

    const res = await fetch(`/api/roles/${role.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Failed to delete");
      // Rejecting is how ConfirmDialog knows to stay open; the toast above
      // already carries the reason.
      throw new Error(data.error ?? "Failed to delete");
    }
    setRoles((prev) => prev.filter((r) => r.id !== role.id));
    toast.success("Role deleted");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <GradientButton type="button" label="Add Role" variant="purple" onClick={openCreateDialog} />
      </div>

      {roles.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="No roles yet"
          description="A role is what decides which applications an employee sees. Create one, then grant it access in the Access Matrix."
          action={<Button onClick={openCreateDialog}>Add Role</Button>}
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody className="stagger">
              {roles.map((role) => (
                <TableRow key={role.id} className="animate-fade-in">
                  <TableCell className="font-medium">{role.name}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(role)}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => requestDelete(role)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Role" : "Add Role"}</DialogTitle>
              <DialogDescription>
                {editingId
                  ? "Rename this role."
                  : "Roles decide which applications a user's dashboard shows (via the Access Matrix)."}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="role-name">Name</Label>
                <Input
                  id="role-name"
                  placeholder="e.g. HR, Finance, IT"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Saving..." : editingId ? "Save changes" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete this role?"
        description={
          deleteTarget
            ? `"${deleteTarget.name}" is removed for good. If employees are still assigned to it, the delete is blocked until you reassign them.`
            : ""
        }
        confirmLabel="Delete role"
        pendingLabel="Deleting..."
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
