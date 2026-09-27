import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import { Slot as SlotPrimitive } from "radix-ui";

import { cn } from "@matops/ui";

import { FOCUS_RING, PRESS } from "./motion";
import { Spinner } from "./spinner";

const buttonVariants = cva(
  "rounded-control flex-row items-center justify-center gap-1.5 border border-transparent font-medium " +
    "inline-flex shrink-0 whitespace-nowrap outline-none " +
    "transition-[background-color,border-color,color,box-shadow,scale] duration-150 " +
    `${PRESS} ${FOCUS_RING} ` +
    "disabled:pointer-events-none disabled:opacity-50 " +
    "aria-invalid:border-error aria-invalid:ring-error/20 " +
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        primary:
          "bg-primary border-primary text-primary-foreground shadow-lift hover:bg-primary/90",
        secondary:
          "edge-lit-surface-2 hover:edge-lit-surface-3 text-secondary-foreground shadow-lift",
        outline:
          "border-border-strong text-foreground hover:bg-hover bg-transparent",
        ghost:
          "text-muted-foreground hover:bg-hover hover:text-foreground bg-transparent",
        destructive:
          "bg-destructive border-destructive text-destructive-foreground hover:bg-destructive/90",
        "destructive-outline":
          "border-error/30 bg-error/10 text-error-text hover:bg-error/20",
        link: "text-foreground decoration-muted-foreground bg-transparent underline hover:decoration-current",
      },
      size: {
        default: "h-8 min-h-11 px-3.5 text-sm sm:min-h-8",
        sm: "h-6 min-h-11 px-2.5 text-xs sm:min-h-6",
        lg: "h-10 min-h-11 px-4.5 text-base sm:min-h-10",
        icon: "h-8 min-h-11 w-8 min-w-11 text-sm sm:min-h-8 sm:min-w-8",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

type ButtonVariants = VariantProps<typeof buttonVariants>;

export function buttonClass({ variant, size }: ButtonVariants = {}) {
  return cn(buttonVariants({ variant, size }));
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
          <span className="invisible contents">{children}</span>
          <Spinner size="sm" className="absolute text-current" />
        </>
      ) : (
        children
      )}
    </Comp>
  );
}
