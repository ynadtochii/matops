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
 * The quiet destructive variant paints with `--error`, not `--destructive`:
 * `--destructive` is a dark maroon on the black theme (a fill meant to carry
 * white text), so as a hairline and a label it would be unreadable.
 */
export const buttonContainerVariants = cva(
  "flex-row items-center justify-center gap-2 rounded-md",
  {
    variants: {
      variant: {
        primary: "bg-primary",
        secondary: "bg-secondary",
        outline: "border-input bg-background border",
        ghost: "bg-transparent",
        destructive: "bg-destructive",
        "destructive-outline": "border-error/35 border bg-transparent",
        link: "bg-transparent",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3",
        lg: "h-10 px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "default" },
  },
);

export const buttonTextVariants = cva("text-sm font-medium", {
  variants: {
    variant: {
      primary: "text-primary-foreground",
      secondary: "text-secondary-foreground",
      outline: "text-foreground",
      ghost: "text-foreground",
      destructive: "text-white",
      "destructive-outline": "text-error",
      link: "text-brand-strong underline",
    },
  },
  defaultVariants: { variant: "primary" },
});

export type ButtonVariants = VariantProps<typeof buttonContainerVariants>;
export type ButtonVariant = NonNullable<ButtonVariants["variant"]>;
