import { cn } from "@matops/ui";

import { FOCUS_RING } from "./motion";

/**
 * Web Textarea — the multi-line twin of `Input`. Same border, radius, focus
 * ring, and disabled treatment, so bank details and notes stop reading as a
 * raw browser box. Height comes from `rows` or a `className` (e.g. `min-h-24`).
 */
export function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input placeholder:text-muted-foreground dark:bg-input/30 field-sizing-content w-full min-w-0 rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        FOCUS_RING,
        "aria-invalid:ring-error/20 dark:aria-invalid:ring-error/40 aria-invalid:border-error",
        className,
      )}
      {...props}
    />
  );
}
