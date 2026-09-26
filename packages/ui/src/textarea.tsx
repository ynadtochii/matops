import { cn } from "@matops/ui";

import { FIELD } from "./input";

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
      className={cn(FIELD, "field-sizing-content py-2", className)}
      {...props}
    />
  );
}
