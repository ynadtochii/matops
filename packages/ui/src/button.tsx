import { Slot as SlotPrimitive } from "radix-ui";

import { cn } from "@matops/ui";

import type { ButtonVariant, ButtonVariants } from "./button-variants";
import { buttonContainerVariants, buttonTextVariants } from "./button-variants";

export { buttonContainerVariants, buttonTextVariants } from "./button-variants";
export type { ButtonVariant, ButtonVariants } from "./button-variants";

/**
 * Web Button — DOM `<button>` (or Radix `Slot`). Text color cascades in the DOM,
 * so container + text recipes both go on the element. Web-only adornments
 * (hover, focus-visible ring, svg sizing, disabled) are added here. The look
 * comes from the shared recipe in ./button-variants; ./button.native.tsx is the
 * mobile twin. See ADR docs/issues/32.
 */
const webAdornments =
  "inline-flex shrink-0 whitespace-nowrap outline-none transition-all " +
  "focus-visible:border-ring focus-visible:ring-ring/50 " +
  "focus-visible:ring-[3px] disabled:pointer-events-none " +
  "disabled:bg-muted disabled:text-muted-foreground disabled:border-transparent " +
  "aria-invalid:border-error aria-invalid:ring-error/20 " +
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

/**
 * Web-only hover states, per variant. A real surface/colour response beats the
 * old blanket `hover:opacity-90`, which dimmed the label along with the fill.
 * Native has no hover, so this stays out of the shared recipe.
 */
const webHover: Record<ButtonVariant, string> = {
  primary: "hover:bg-primary/90",
  secondary: "hover:bg-secondary/70",
  outline: "hover:bg-muted hover:text-foreground",
  ghost: "hover:bg-muted hover:text-foreground",
  destructive: "hover:bg-destructive/90",
  "destructive-outline": "hover:border-error/60 hover:bg-error/10",
  link: "hover:underline",
};

/**
 * A 44px floor on the compact size: `sm` is the list-row size, and a 32px row
 * action is under the touch target on a phone. Desktop keeps the dense 32px.
 */
const webSize: Partial<Record<NonNullable<ButtonVariants["size"]>, string>> = {
  sm: "min-h-11 sm:min-h-8",
};

/**
 * The full web class string for a button. Use it where a real `<Button>` can't
 * go: a Radix primitive that owns its own element (see alert-dialog.tsx).
 */
export function buttonClass({ variant, size }: ButtonVariants = {}) {
  return cn(
    buttonContainerVariants({ variant, size }),
    buttonTextVariants({ variant }),
    webAdornments,
    webHover[variant ?? "primary"],
    size && webSize[size],
  );
}

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
      className={cn(buttonClass({ variant, size }), className)}
      {...props}
    />
  );
}
