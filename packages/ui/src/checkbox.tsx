"use client";

import { CheckIcon, MinusIcon } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";

import { cn } from "@matops/ui";

import { FOCUS_RING } from "./motion";

export function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "border-control bg-raised hover:border-foreground-faint data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary text-primary-foreground peer aria-invalid:border-error grid size-3.5 shrink-0 place-items-center rounded-sm border transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
        FOCUS_RING,
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="group grid place-items-center">
        <CheckIcon className="size-3 group-data-[state=indeterminate]:hidden" />
        <MinusIcon className="hidden size-3 group-data-[state=indeterminate]:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
