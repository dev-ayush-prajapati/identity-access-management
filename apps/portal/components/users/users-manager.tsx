"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowUpCircle, KeyRound, MoreHorizontal, Power, UserCog, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
  DropdownMenuSeparator,
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

// One "here's a password" dialog, reused for both creation and a forced
// reset — same shape, different opening line.
type TempCredentials = { email: string; password: string; reason: "created" | "reset" };

type PendingAction = { type: "delete" | "disable" | "promote"; user: UserWithRole };

export function UsersManager({ initialUsers, targetUserType, roles = [] }: UsersManagerProps) {
  const [users, setUsers] = useState(initialUsers);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [tempCredentials, setTempCredentials] = useState<TempCredentials | null>(null);
  // Two pieces of state, not one nullable target: the dialog stays mounted
  // through its close animation, so clearing the target on close would blank
  // the name mid-fade.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

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
        setTempCredentials({ email: user.email, password: tempPassword, reason: "created" });
      }
      setDialogOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResetPassword(user: UserWithRole) {
    const res = await fetch(`/api/users/${user.id}/reset-password`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Failed to reset password");
      return;
    }
    setTempCredentials({ email: user.email, password: data.tempPassword, reason: "reset" });
  }

  // Shared by both directions: enabling fires this straight from the
  // dropdown, disabling fires it as the ConfirmDialog's onConfirm — which is
  // why it resolves on success and throws on failure (that's how
  // ConfirmDialog knows whether to close).
  async function performStatusChange(user: UserWithRole, status: "ACTIVE" | "DISABLED") {
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Failed to update status");
      throw new Error(data.error ?? "Failed to update status");
    }
    setUsers((prev) => prev.map((u) => (u.id === user.id ? data : u)));
    toast.success(status === "ACTIVE" ? `${label} enabled` : `${label} disabled`);
  }

  function handleEnable(user: UserWithRole) {
    performStatusChange(user, "ACTIVE").catch(() => {
      // Already toasted above; nothing else needs this rejection.
    });
  }

  async function performPromote(user: UserWithRole) {
    const res = await fetch(`/api/users/${user.id}/user-type`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userType: "SUPERADMIN" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error ?? "Failed to promote");
      throw new Error(data.error ?? "Failed to promote");
    }
    // A promoted Admin is a SuperAdmin now — it no longer belongs in this
    // (Admins-only) list, so it's removed rather than updated in place.
    setUsers((prev) => prev.filter((u) => u.id !== user.id));
    toast.success(`${user.name} promoted to SuperAdmin`);
  }

  function requestConfirm(type: PendingAction["type"], user: UserWithRole) {
    setPendingAction({ type, user });
    setConfirmOpen(true);
  }

  async function handleConfirm() {
    if (!pendingAction) return;
    const { type, user } = pendingAction;

    if (type === "disable") {
      await performStatusChange(user, "DISABLED");
      return;
    }
    if (type === "promote") {
      await performPromote(user);
      return;
    }

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

  const confirmCopy = (() => {
    if (!pendingAction) return null;
    const { type, user } = pendingAction;
    if (type === "delete") {
      return {
        title: `Delete this ${label.toLowerCase()}?`,
        description: `${user.name} loses their Keycloak login for good and can't sign in anywhere again. Their portal record is kept (not removed) so past audit log entries stay attributable. This can't be undone.`,
        confirmLabel: `Delete ${label.toLowerCase()}`,
        pendingLabel: "Deleting...",
        destructive: true,
      };
    }
    if (type === "disable") {
      return {
        title: `Disable ${user.name}?`,
        description: `${user.name} is signed out of every app on their next request and can't sign back in until re-enabled. Their account and history stay intact — this can be reversed.`,
        confirmLabel: "Disable",
        pendingLabel: "Disabling...",
        destructive: true,
      };
    }
    return {
      title: `Promote ${user.name} to SuperAdmin?`,
      description: `${user.name} gains full SuperAdmin powers — managing Admins and the Application catalog — and leaves this Admins list. This isn't reversible from here (a SuperAdmin would need to demote them back).`,
      confirmLabel: "Promote",
      pendingLabel: "Promoting...",
      destructive: false,
    };
  })();

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
                <TableHead>Status</TableHead>
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
                    <Badge variant={user.status === "ACTIVE" ? "outline" : "destructive"}>
                      {user.status === "ACTIVE" ? "Active" : "Disabled"}
                    </Badge>
                  </TableCell>
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
                        <DropdownMenuItem onClick={() => handleResetPassword(user)}>
                          <KeyRound className="size-4" />
                          Reset password
                        </DropdownMenuItem>
                        {user.status === "ACTIVE" ? (
                          <DropdownMenuItem onClick={() => requestConfirm("disable", user)}>
                            <Power className="size-4" />
                            Disable
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleEnable(user)}>
                            <Power className="size-4" />
                            Enable
                          </DropdownMenuItem>
                        )}
                        {targetUserType === "ADMIN" && (
                          <DropdownMenuItem onClick={() => requestConfirm("promote", user)}>
                            <ArrowUpCircle className="size-4" />
                            Promote to SuperAdmin
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => requestConfirm("delete", user)}
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
            <DialogTitle>{tempCredentials?.reason === "reset" ? "Password reset" : `${label} created`}</DialogTitle>
            <DialogDescription>
              Share this temporary password with {tempCredentials?.email} — they&apos;ll be forced
              to change it on {tempCredentials?.reason === "reset" ? "their next" : "first"} login.
              It won&apos;t be shown again.
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

      {confirmCopy && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={confirmCopy.title}
          description={confirmCopy.description}
          confirmLabel={confirmCopy.confirmLabel}
          pendingLabel={confirmCopy.pendingLabel}
          destructive={confirmCopy.destructive}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}
