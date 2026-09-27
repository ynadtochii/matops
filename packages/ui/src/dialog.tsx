"use client";

import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";

import { cn } from "@matops/ui";

import { FOCUS_RING } from "./motion";

/**
 * Plain content modal — a panel you open to read or edit something, as opposed
 * to `ConfirmDialog` (alert-dialog.tsx), which asks a yes/no question about an
 * action that can't be undone. Same Radix behaviour: focus trap, Escape closes,
 * click outside closes. Enter animation only, for the reason spelled out in
 * alert-dialog.tsx.
 */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

export function DialogContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=open]:fade-in-0 bg-backdrop fixed inset-0 z-50 duration-150 ease-out motion-reduce:animate-none" />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "text-foreground data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 bg-raised shadow-float fixed top-1/2 left-1/2 z-50 flex max-h-[85dvh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-3 overflow-y-auto overscroll-contain rounded-xl p-5 duration-150 ease-out motion-reduce:animate-none sm:gap-4 sm:p-6",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          aria-label="Close"
          className={cn(
            "text-muted-foreground hover:text-foreground hover:bg-hover absolute top-3 right-3 flex size-10 items-center justify-center rounded-md transition-colors outline-none",
            FOCUS_RING,
          )}
        >
          <XIcon aria-hidden="true" className="size-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      className={cn(
        "pr-10 text-xl leading-tight font-semibold tracking-tight",
        className,
      )}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      className={cn("text-muted-foreground text-sm leading-relaxed", className)}
      {...props}
    />
  );
}
