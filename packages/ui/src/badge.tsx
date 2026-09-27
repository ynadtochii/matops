import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";

import { cn } from "@matops/ui";

const badgeVariants = cva(
  "inline-flex h-5.5 shrink-0 items-center gap-1.5 rounded-sm border px-1.5 text-xs font-medium whitespace-nowrap [&_svg:not([class*='size-'])]:size-3",
  {
    variants: {
      tone: {
        neutral: "border-border-strong bg-surface-2 text-foreground-secondary",
        info: "border-info/30 bg-info/10 text-info",
        lit: "border-foreground/35 bg-foreground/[0.07] text-foreground shadow-[0_0_12px_-2px_color-mix(in_oklab,var(--foreground)_40%,transparent)] [text-shadow:0_0_10px_color-mix(in_oklab,var(--foreground)_45%,transparent)]",
        success: "border-success/30 bg-success/10 text-success",
        warning: "border-warning/30 bg-warning/10 text-warning",
        error: "border-error/30 bg-error/10 text-error-text",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>;

export function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ tone }), className)}
      {...props}
    />
  );
}
