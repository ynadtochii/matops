"use client";

import { RadioGroup as RadioGroupPrimitive } from "radix-ui";

import { cn } from "@matops/ui";

import { FOCUS_RING } from "./motion";

export function RadioGroup({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Root>) {
  return (
    <RadioGroupPrimitive.Root
      data-slot="radio-group"
      className={cn("grid gap-2", className)}
      {...props}
    />
  );
}

export function RadioGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof RadioGroupPrimitive.Item>) {
  return (
    <RadioGroupPrimitive.Item
      data-slot="radio-group-item"
      className={cn(
        "border-control bg-raised hover:border-foreground-faint data-[state=checked]:border-brand data-[state=checked]:bg-brand-foreground peer aria-invalid:border-error size-3.5 shrink-0 rounded-full border transition-[border-color,border-width] outline-none disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-4 motion-reduce:transition-none",
        FOCUS_RING,
        className,
      )}
      {...props}
    />
  );
}
