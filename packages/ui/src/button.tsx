import { Slot as SlotPrimitive } from "radix-ui";

import { cn } from "@matops/ui";

import type { ButtonVariants } from "./button-variants";
import { buttonContainerVariants, buttonTextVariants } from "./button-variants";

export { buttonContainerVariants, buttonTextVariants } from "./button-variants";
export type { ButtonVariants } from "./button-variants";

/**
 * Web Button — DOM `<button>` (or Radix `Slot`). Text color cascades in the DOM,
 * so container + text recipes both go on the element. Web-only adornments
 * (hover, focus-visible ring, svg sizing, disabled) are added here. The look
 * comes from the shared recipe in ./button-variants; ./button.native.tsx is the
 * mobile twin. See ADR docs/issues/32.
 */
const webAdornments =
  "inline-flex shrink-0 whitespace-nowrap outline-none transition-all " +
  "hover:opacity-90 focus-visible:border-ring focus-visible:ring-ring/50 " +
  "focus-visible:ring-[3px] disabled:pointer-events-none disabled:opacity-50 " +
  "aria-invalid:border-destructive aria-invalid:ring-destructive/20 " +
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  ButtonVariants & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? SlotPrimitive.Slot : "button";

  return (
    <Comp
      data-slot="button"
      className={cn(
        buttonContainerVariants({ variant, size }),
        buttonTextVariants({ variant }),
        webAdornments,
        className,
      )}
      {...props}
    />
  );
}
