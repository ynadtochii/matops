/// <reference types="react-native-css/types" />
import type { PressableProps } from "react-native";
import { Pressable, Text } from "react-native";

import { cn } from "@matops/ui";

import type { ButtonVariants } from "./button-variants";
import { buttonContainerVariants, buttonTextVariants } from "./button-variants";

export { buttonContainerVariants, buttonTextVariants } from "./button-variants";
export type { ButtonVariants } from "./button-variants";

/**
 * Mobile Button — RN `<Pressable>` + `<Text>`. The look comes from the SAME
 * shared recipe as the web Button (./button-variants), so variants match across
 * platforms. Native adornments here: pressed state (`active:`), disabled
 * opacity, and a 44px touch-target floor (`min-h-11`) so even the compact `sm`
 * default stays tappable on mobile. String children auto-wrap in a styled
 * `<Text>`; pass nodes (e.g. an icon + text) to lay them out yourself.
 * See ADR docs/issues/32.
 */
export type ButtonProps = PressableProps &
  ButtonVariants & {
    /** Extra classes for the label `<Text>` (native text color must ride it). */
    textClassName?: string;
  };

export function Button({
  className,
  textClassName,
  variant,
  size,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      className={cn(
        buttonContainerVariants({ variant, size }),
        "min-h-11 active:opacity-90",
        disabled && "opacity-50",
        className,
      )}
      {...props}
    >
      {typeof children === "string" ? (
        <Text className={cn(buttonTextVariants({ variant }), textClassName)}>
          {children}
        </Text>
      ) : (
        children
      )}
    </Pressable>
  );
}
