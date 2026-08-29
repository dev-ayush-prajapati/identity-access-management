"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MoreHorizontal, UserCog, Users } from "lucide-react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { Role, User, UserType } from "@/lib/generated/prisma";

type UserWithRole = User & { role: Role | null };

interface UsersManagerProps {
  initialUsers: UserWithRole[];
  targetUserType: UserType;
  roles?: Role[];
}

type FormState = { name: string; email: string; roleId: string };

const EMPTY_FORM: FormState = { name: "", email: "", roleId: "" };

export function UsersManager({ initialUsers, targetUserType, roles = [] }: UsersManagerProps) {
  const [users, setUsers] = useState(initialUsers);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [tempCredentials, setTempCredentials] = useState<{ email: string; password: string } | null>(
    null
  );
  // Two pieces of state, not one nullable target: the dialog stays mounted
  // through its close animation, so clearing the target on close would blank
  // the name mid-fade.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<UserWithRole | null>(null);

  const label = targetUserType === "ADMIN" ? "Admin" : "Employee";

  // The two tiers do different jobs, so an empty screen has to explain a
  // different thing on each.
  const emptyCopy =
    targetUserType === "ADMIN"
      ? {
          icon: UserCog,
          title: "No admins yet",
          description:
            "Admins manage Roles, Employees, and the Access Matrix. Add one to hand that work over — Admins carry no Role of their own.",
        }
      : {
          icon: Users,
          title: "No employees yet",
          description:
            "Employees sign in with SSO and see only the applications their Role grants them. Add one, then give it a Role.",
        };

  function openCreateDialog() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEditDialog(user: UserWithRole) {
    setEditingId(user.id);
    setForm({ name: user.name, email: user.email, roleId: user.roleId ?? "" });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const body =
        targetUserType === "EMPLOYEE"
          ? { name: form.name, email: form.email, roleId: form.roleId }
          : { name: form.name, email: form.email };

      const res = await fetch(editingId ? `/api/users/${editingId}` : "/api/users", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Something went wrong");
        return;
      }

      if (editingId) {
        setUsers((prev) => prev.map((u) => (u.id === editingId ? data : u)));
        toast.success(`${label} updated`);
      } else {
        const { tempPassword, ...user } = data;
        setUsers((prev) => [...prev, user]);
        setTempCredentials({ email: user.email, password: tempPassword });
      }
      setDialogOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  function requestDelete(user: UserWithRole) {
    setDeleteTarget(user);
    setConfirmOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const user = deleteTarget;

    const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Failed to delete");
      // Rejecting is how ConfirmDialog knows to stay open; the toast above
      // already carries the reason.
      throw new Error(data.error ?? "Failed to delete");
    }
    setUsers((prev) => prev.filter((u) => u.id !== user.id));
    toast.success(`${label} deleted`);
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <GradientButton
          type="button"
          label={`Add ${label}`}
          variant="orange"
          onClick={openCreateDialog}
        />
      </div>

      {users.length === 0 ? (
        <EmptyState
          icon={emptyCopy.icon}
          title={emptyCopy.title}
          description={emptyCopy.description}
          action={<Button onClick={openCreateDialog}>Add {label}</Button>}
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                {targetUserType === "EMPLOYEE" && <TableHead>Role</TableHead>}
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody className="stagger">
              {users.map((user) => (
                <TableRow key={user.id} className="animate-fade-in">
                  <TableCell className="font-medium">{user.name}</TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  {targetUserType === "EMPLOYEE" && (
                    <TableCell className="text-muted-foreground">
                      {user.role?.name ?? "—"}
                    </TableCell>
                  )}
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
                        <DropdownMenuItem onClick={() => openEditDialog(user)}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => requestDelete(user)}
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
              <DialogTitle>{editingId ? `Edit ${label}` : `Add ${label}`}</DialogTitle>
              <DialogDescription>
                {editingId
                  ? `Update this ${label.toLowerCase()}'s details.`
                  : `Creates a Keycloak login for this ${label.toLowerCase()} (temp password, forced reset on first login).`}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="user-name">Name</Label>
                <Input
                  id="user-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="user-email">Email</Label>
                <Input
                  id="user-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  disabled={!!editingId}
                  required
                />
              </div>
              {targetUserType === "EMPLOYEE" && (
                <div className="grid gap-2">
                  <Label htmlFor="user-role">Role</Label>
                  <Select
                    value={form.roleId}
                    onValueChange={(value) => setForm((f) => ({ ...f, roleId: value ?? "" }))}
                  >
                    <SelectTrigger id="user-role">
                      <SelectValue placeholder="Select a role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
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

      <Dialog open={!!tempCredentials} onOpenChange={(open) => !open && setTempCredentials(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{label} created</DialogTitle>
            <DialogDescription>
              Share this temporary password with {tempCredentials?.email} — they&apos;ll be forced
              to change it on first login. It won&apos;t be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted p-3 font-mono text-sm">
            {tempCredentials?.password}
          </div>
          <DialogFooter>
            <Button
              type="button"
              onClick={() => {
                if (tempCredentials) {
                  navigator.clipboard.writeText(tempCredentials.password);
                  toast.success("Copied to clipboard");
                }
              }}
            >
              Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete this ${label.toLowerCase()}?`}
        description={
          deleteTarget
            ? `${deleteTarget.name} loses their portal account and their Keycloak login, so they can no longer sign in anywhere. This can't be undone.`
            : ""
        }
        confirmLabel={`Delete ${label.toLowerCase()}`}
        pendingLabel="Deleting..."
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
