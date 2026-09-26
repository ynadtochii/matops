"use client";

import { cn } from "@matops/ui";

export function FieldError({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  if (!children) return null;

  return (
    <div
      role="alert"
      data-slot="field-error"
      className={cn("text-error-text text-sm font-normal", className)}
      {...props}
    >
      {children}
    </div>
  );
}
