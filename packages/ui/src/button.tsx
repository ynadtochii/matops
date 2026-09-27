import { Slot as SlotPrimitive } from "radix-ui";

import { cn } from "@matops/ui";

import type { ButtonVariant, ButtonVariants } from "./button-variants";
import { buttonContainerVariants, buttonTextVariants } from "./button-variants";
import { FOCUS_RING, PRESS } from "./motion";
import { Spinner } from "./spinner";

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
  "inline-flex shrink-0 whitespace-nowrap outline-none " +
  "transition-[background-color,border-color,color,box-shadow,scale] duration-150 " +
  `${PRESS} ${FOCUS_RING} ` +
  "disabled:pointer-events-none disabled:opacity-50 " +
  "aria-invalid:border-error aria-invalid:ring-error/20 " +
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

/**
 * Web-only hover states, per variant. A real surface/colour response beats the
 * old blanket `hover:opacity-90`, which dimmed the label along with the fill.
 * Native has no hover, so this stays out of the shared recipe.
 */
const webHover: Record<ButtonVariant, string> = {
  primary: "shadow-lift hover:bg-primary/90",
  secondary: "hover:bg-active hover:border-border-strong",
  outline: "hover:bg-hover hover:border-border-strong",
  ghost: "hover:bg-hover hover:text-foreground",
  destructive: "hover:bg-destructive/90",
  "destructive-outline": "hover:bg-error/20",
  link: "hover:decoration-current",
};

/**
 * A 44px floor on every size for touch. The drawn heights (24/32/40px) are all
 * under the target on a phone; desktop keeps the dense original.
 */
const webSize: Partial<Record<NonNullable<ButtonVariants["size"]>, string>> = {
  default: "min-h-11 sm:min-h-8",
  sm: "min-h-11 sm:min-h-6",
  lg: "min-h-11 sm:min-h-10",
  icon: "min-h-11 min-w-11 sm:min-h-8 sm:min-w-8",
};

/**
 * The full web class string for a button. Use it where a real `<Button>` can't
 * go: a Radix primitive that owns its own element (see alert-dialog.tsx).
 */
export function buttonClass({ variant, size }: ButtonVariants = {}) {
  return cn(
    buttonContainerVariants({ variant, size }),
    buttonTextVariants({ variant, size }),
    webAdornments,
    webHover[variant ?? "primary"],
    webSize[size ?? "default"],
  );
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  busy = false,
  children,
  ...props
}: React.ComponentProps<"button"> &
  ButtonVariants & {
    asChild?: boolean;
    busy?: boolean;
  }) {
  const Comp = asChild ? SlotPrimitive.Slot : "button";
  const spin = busy && !asChild;

  return (
    <Comp
      data-slot="button"
      className={cn(
        buttonClass({ variant, size }),
        spin && "relative",
        className,
      )}
      {...props}
    >
      {spin ? (
        <>
          {/* The label keeps its box so the button can't resize mid-action. */}
          <span className="invisible contents">{children}</span>
          <Spinner size="sm" className="absolute text-current" />
        </>
      ) : (
        children
      )}
    </Comp>
  );
}
