import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";

/**
 * Shared Button style recipe — the cross-platform layer.
 *
 * Contains ONLY classes that work on both web (Tailwind) and mobile (NativeWind):
 * color, size, radius, spacing, layout. No web-only pseudo-selectors
 * (`hover:`, `focus-visible:`, `[&_svg]`, `has-[…]`, `aria-*`) — those live in
 * the platform files (button.tsx / button.native.tsx) as adornments.
 *
 * Split in two because React Native does NOT cascade text color from a
 * container to a child `<Text>`: the container recipe styles the pressable, the
 * text recipe styles the label. Same `variant` names on both → identical look.
 * See docs/design.md and ADR docs/issues/32.
 *
 * Which variant goes where is a function of place, not of danger: design.md §1.5.
 *
 * The quiet destructive variant paints with `--error` and `--error-text`, not
 * `--destructive`: `--destructive` is a dark maroon on the dark theme (a fill
 * meant to carry light text), so as an edge and a label it would be unreadable.
 */
export const buttonContainerVariants = cva(
  "flex-row items-center justify-center gap-1.5 rounded-full border border-transparent",
  {
    variants: {
      variant: {
        primary: "bg-primary border-primary",
        secondary: "bg-secondary border-border",
        outline: "border-border bg-transparent",
        ghost: "bg-transparent",
        destructive: "bg-destructive border-destructive",
        "destructive-outline": "border-error/30 bg-error/10",
        link: "bg-transparent",
      },
      size: {
        default: "h-8 px-3.5",
        sm: "h-6 px-2.5",
        lg: "h-10 px-4.5",
        icon: "h-8 w-8 rounded-sm",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export const buttonTextVariants = cva("font-medium", {
  variants: {
    variant: {
      primary: "text-primary-foreground",
      secondary: "text-secondary-foreground",
      outline: "text-foreground",
      ghost: "text-muted-foreground",
      destructive: "text-destructive-foreground",
      "destructive-outline": "text-error-text",
      link: "text-foreground decoration-muted-foreground underline",
    },
    size: {
      default: "text-sm",
      sm: "text-xs",
      lg: "text-base",
      icon: "text-sm",
    },
  },
  defaultVariants: { variant: "primary", size: "default" },
});

export type ButtonVariants = VariantProps<typeof buttonContainerVariants>;
export type ButtonVariant = NonNullable<ButtonVariants["variant"]>;
