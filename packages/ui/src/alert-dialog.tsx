"use client";

import { useState } from "react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";

import { cn } from "@matops/ui";

import { buttonClass } from "./button";
import { Spinner } from "./spinner";

/**
 * Confirmation modal for actions that can't be undone — remove a member, cancel
 * a class, delete a plan, rotate an invite link. Built on Radix `AlertDialog`,
 * so it traps focus, closes on Escape, and the confirm button gets focus on
 * open (a deliberate barrier, not a place to click through by habit).
 *
 * Two ways to use it:
 *  - Controlled `<ConfirmDialog>` (below) — the common case. Give it a trigger,
 *    a title, a body, and `onConfirm`. It handles the pending state itself.
 *  - The lower-level parts (Root/Trigger/Content/…) for custom layouts.
 *
 * Web-only (Radix DOM portal); mobile confirms use the RN Alert API.
 */

export function AlertDialog(
  props: React.ComponentProps<typeof AlertDialogPrimitive.Root>,
) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

export function AlertDialogTrigger(
  props: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>,
) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  );
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn(
        // Enter animation only. A close must never wait on an exit animation's
        // `animationend` — if that event doesn't fire, Radix keeps the node
        // mounted and the modal is stuck. Unmounting immediately is safer.
        "data-[state=open]:animate-in data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className,
      )}
      {...props}
    />
  );
}

export function AlertDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        className={cn(
          // Enter animation only — see the Overlay note on why close must not
          // depend on an exit animation.
          "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 fixed top-1/2 left-1/2 z-50 grid w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 gap-4 rounded-lg border p-6 shadow-lg",
          className,
        )}
        {...props}
      />
    </AlertDialogPrimitive.Portal>
  );
}

export function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("text-lg font-semibold tracking-tight", className)}
      {...props}
    />
  );
}

export function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    />
  );
}

export function AlertDialogCancel({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return (
    <AlertDialogPrimitive.Cancel
      data-slot="alert-dialog-cancel"
      className={cn(buttonClass({ variant: "outline" }), className)}
      {...props}
    />
  );
}

export function AlertDialogAction({
  className,
  variant = "destructive",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> & {
  variant?: "destructive" | "primary";
}) {
  return (
    <AlertDialogPrimitive.Action
      data-slot="alert-dialog-action"
      className={cn(buttonClass({ variant }), className)}
      {...props}
    />
  );
}

/**
 * The everyday confirm modal. Wraps a trigger, asks a question, and runs
 * `onConfirm` — which may be async; the confirm button shows a spinner and the
 * dialog stays open until it resolves, then closes itself. Errors are the
 * caller's to surface (usually a toast in the mutation's `onError`); on a
 * rejection the dialog stays open so the user can retry or cancel.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "destructive",
  onConfirm,
}: {
  trigger: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "primary";
  onConfirm: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleConfirm(event: React.MouseEvent) {
    // Keep the dialog open while the async action runs, so the spinner shows.
    event.preventDefault();
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) setOpen(next);
      }}
    >
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        {description && (
          <AlertDialogDescription>{description}</AlertDialogDescription>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            variant={variant}
            disabled={busy}
            onClick={handleConfirm}
          >
            {busy && <Spinner size="sm" className="text-current" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
