import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";

import { cn } from "@matops/ui";

const calloutVariants = cva(
  "text-foreground-secondary flex w-full gap-2.5 rounded-lg border p-3 text-sm [&>svg]:mt-0.5 [&>svg]:shrink-0",
  {
    variants: {
      tone: {
        neutral: "border-border bg-surface-1 [&>svg]:text-muted-foreground",
        info: "border-info/30 bg-info/8 [&>svg]:text-info",
        success: "border-success/30 bg-success/8 [&>svg]:text-success",
        warning: "border-warning/25 bg-warning/7 [&>svg]:text-warning",
        error: "border-error/30 bg-error/8 [&>svg]:text-error-text",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export function Callout({
  className,
  tone,
  title,
  icon,
  children,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> &
  VariantProps<typeof calloutVariants> & {
    title?: React.ReactNode;
    icon?: React.ReactNode;
  }) {
  return (
    <div
      data-slot="callout"
      role={tone === "error" ? "alert" : undefined}
      className={cn(calloutVariants({ tone }), className)}
      {...props}
    >
      {icon}
      <div className="flex min-w-0 flex-col gap-0.5">
        {title && <p className="text-foreground font-medium">{title}</p>}
        {children}
      </div>
    </div>
  );
}
