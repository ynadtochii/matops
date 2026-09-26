"use client";

import type { ToasterProps } from "sonner";
import { Toaster as Sonner, toast as sonnerToast } from "sonner";

import { useTheme } from "./theme";

export const Toaster = ({ ...props }: ToasterProps) => {
  const { themeMode } = useTheme();

  return (
    <Sonner
      theme={themeMode === "auto" ? "system" : themeMode}
      className="toaster group"
      closeButton
      toastOptions={{ className: "shadow-float! text-sm!" }}
      style={
        {
          "--normal-bg": "var(--floating)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "transparent",
          "--border-radius": "8px",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

/**
 * Sonner's toast with one change: an error waits to be dismissed. It is the
 * only account of what went wrong, and four seconds is not long enough to read
 * it, act on it, or have a screen reader finish it. Pass `duration` to override.
 */
export const toast = {
  ...sonnerToast,
  error: (
    message: Parameters<typeof sonnerToast.error>[0],
    options?: Parameters<typeof sonnerToast.error>[1],
  ) => sonnerToast.error(message, { duration: Infinity, ...options }),
};
