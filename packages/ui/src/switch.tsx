"use client";

import { Switch as SwitchPrimitive } from "radix-ui";

import { cn } from "@matops/ui";

import { FOCUS_RING } from "./motion";

export function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "bg-track ring-control data-[state=checked]:bg-brand data-[state=checked]:ring-brand peer inline-flex h-4 w-7 shrink-0 items-center rounded-full ring-1 transition-colors outline-none ring-inset disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
        FOCUS_RING,
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="bg-muted-foreground data-[state=checked]:bg-brand-foreground block size-3 translate-x-0.5 rounded-full transition-transform duration-150 data-[state=checked]:translate-x-3.5 motion-reduce:transition-none" />
    </SwitchPrimitive.Root>
  );
}
