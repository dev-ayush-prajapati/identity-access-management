"use client";

import { useState } from "react";
import { toast } from "sonner";
import { AppWindow, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import GradientButton from "@/components/kokonutui/gradient-button";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import type { Application } from "@/lib/generated/prisma";

interface ApplicationsManagerProps {
  initialApplications: Application[];
}

type FormState = { name: string; url: string; description: string };

const EMPTY_FORM: FormState = { name: "", url: "", description: "" };

export function ApplicationsManager({ initialApplications }: ApplicationsManagerProps) {
  const [applications, setApplications] = useState(initialApplications);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  // Two pieces of state, not one nullable target: the dialog stays mounted
  // through its close animation, so clearing the target on close would blank
  // the application's name mid-fade.
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Application | null>(null);

  function openCreateDialog() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEditDialog(app: Application) {
    setEditingId(app.id);
    setForm({ name: app.name, url: app.url, description: app.description ?? "" });
    setDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(
        editingId ? `/api/applications/${editingId}` : "/api/applications",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Something went wrong");
        return;
      }

      if (editingId) {
        setApplications((prev) => prev.map((a) => (a.id === editingId ? data : a)));
        toast.success("Application updated");
      } else {
        setApplications((prev) => [...prev, data]);
        toast.success("Application created");
      }
      setDialogOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  function requestDelete(app: Application) {
    setDeleteTarget(app);
    setConfirmOpen(true);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const app = deleteTarget;

    const res = await fetch(`/api/applications/${app.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast.error(data.error ?? "Failed to delete");
      // Rejecting is how ConfirmDialog knows to stay open; the toast above
      // already carries the reason.
      throw new Error(data.error ?? "Failed to delete");
    }
    setApplications((prev) => prev.filter((a) => a.id !== app.id));
    toast.success("Application deleted");
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <GradientButton
          type="button"
          label="Add Application"
          variant="emerald"
          onClick={openCreateDialog}
        />
      </div>

      {applications.length === 0 ? (
        <EmptyState
          icon={AppWindow}
          title="No applications yet"
          description="This catalog is what the Access Matrix maps Roles against — register an application here before any Role can be given access to it."
          action={<Button onClick={openCreateDialog}>Add Application</Button>}
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody className="stagger">
              {applications.map((app) => (
                <TableRow key={app.id} className="animate-fade-in">
                  <TableCell className="font-medium">{app.name}</TableCell>
                  <TableCell className="text-muted-foreground">{app.url}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {app.description || "—"}
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
                        <DropdownMenuItem onClick={() => openEditDialog(app)}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => requestDelete(app)}
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
              <DialogTitle>{editingId ? "Edit Application" : "Add Application"}</DialogTitle>
              <DialogDescription>
                {editingId
                  ? "Update this application's details."
                  : "Register a new application in the system."}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="app-name">Name</Label>
                <Input
                  id="app-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="app-url">URL</Label>
                <Input
                  id="app-url"
                  type="url"
                  placeholder="http://localhost:3001"
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="app-description">Description</Label>
                <Textarea
                  id="app-description"
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
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
        title="Delete this application?"
        description={
          deleteTarget
            ? `"${deleteTarget.name}" leaves the catalog and disappears from every Employee dashboard. If any Role still has access to it, the delete is blocked until you revoke that in the Access Matrix.`
            : ""
        }
        confirmLabel="Delete application"
        pendingLabel="Deleting..."
        destructive
        onConfirm={handleDelete}
      />
    </div>
  );
}
