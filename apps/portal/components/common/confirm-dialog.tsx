"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  // Shown on the confirm button while onConfirm is in flight.
  pendingLabel?: string;
  destructive?: boolean;
  // Resolve to close the dialog, reject to leave it open — the caller owns the
  // error message, since only it knows what failed.
  onConfirm: () => Promise<void>;
}

// Stands in for window.confirm on anything destructive. The native dialog
// can't be styled, blocks the whole tab, and browsers suppress it outright in
// some contexts — which would quietly turn a delete into a no-op.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel = "Working...",
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // Deliberately swallowed: the caller has already surfaced why. Staying
      // open keeps the retry one click away instead of sending the reader
      // back to find the row again.
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Esc and backdrop clicks would otherwise dismiss the dialog while the
        // request is still running, hiding its outcome.
        if (!pending) onOpenChange(next);
      }}
    >
      {/* Cancel holds the initial focus, so a stray Enter backs out rather
          than confirming something irreversible. */}
      <DialogContent initialFocus={cancelRef}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={handleConfirm}
          >
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
