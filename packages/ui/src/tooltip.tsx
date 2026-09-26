"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";

import { cn } from "@matops/ui";

export function Tooltip({
  delayDuration = 400,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root data-slot="tooltip" {...props} />
    </TooltipPrimitive.Provider>
  );
}

export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "bg-floating text-foreground shadow-float data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 z-50 flex max-w-xs items-center gap-2 rounded-md px-2 py-1 text-xs duration-150 motion-reduce:animate-none",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}
