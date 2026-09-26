"use client";

import { Tabs as TabsPrimitive } from "radix-ui";

import { cn } from "@matops/ui";

import { FOCUS_RING } from "./motion";

export const Tabs = TabsPrimitive.Root;

export function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "border-border flex w-full gap-5 overflow-x-auto border-b",
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "text-muted-foreground hover:text-foreground data-[state=active]:text-foreground relative flex min-h-11 shrink-0 items-center gap-1.5 rounded-sm text-sm font-medium whitespace-nowrap transition-colors outline-none disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none sm:min-h-9",
        "data-[state=active]:after:bg-foreground after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:rounded-t-sm",
        FOCUS_RING,
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("outline-none", className)}
      {...props}
    />
  );
}
