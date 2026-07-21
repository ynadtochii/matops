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
 */
export const buttonContainerVariants = cva(
  "flex-row items-center justify-center gap-2 rounded-md",
  {
    variants: {
      variant: {
        default: "bg-primary",
        secondary: "bg-secondary",
        outline: "border-input bg-background border",
        ghost: "bg-transparent",
        destructive: "bg-destructive",
        link: "bg-transparent",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-8 px-3",
        lg: "h-10 px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export const buttonTextVariants = cva("text-sm font-medium", {
  variants: {
    variant: {
      default: "text-primary-foreground",
      secondary: "text-secondary-foreground",
      outline: "text-foreground",
      ghost: "text-foreground",
      destructive: "text-white",
      link: "text-primary underline",
    },
  },
  defaultVariants: { variant: "default" },
});

export type ButtonVariants = VariantProps<typeof buttonContainerVariants>;
