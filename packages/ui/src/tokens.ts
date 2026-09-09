/**
 * Raw token hex values — the TypeScript twin of `tooling/tailwind/theme.css`.
 *
 * Use classNames (`bg-primary`, `text-foreground`, …) everywhere you can. Reach
 * for this ONLY where an API needs a literal color string, not a class — mostly
 * React Native: expo-router `Stack` header colors, `placeholderTextColor`,
 * `StatusBar`, `ActivityIndicator`.
 *
 * Keep in sync with theme.css. Values below mirror the Better Auth brand system
 * (light = their :root; dark = their brand page). See docs/design.md §1.1.
 */

export const tokens = {
  light: {
    background: "#ffffff",
    foreground: "#0c0a09",
    card: "#fafaf9",
    cardForeground: "#0c0a09",
    popover: "#ffffff",
    popoverForeground: "#0c0a09",
    primary: "#1c1917",
    primaryForeground: "#fafaf9",
    secondary: "#f5f5f4",
    secondaryForeground: "#1c1917",
    muted: "#f5f5f4",
    mutedForeground: "#79716b",
    accent: "#f5f5f4",
    accentForeground: "#1c1917",
    destructive: "#e40014",
    destructiveForeground: "#fafaf9",
    brand: "#6a4dff",
    brandStrong: "#5a3cf0",
    brandForeground: "#ffffff",
    brandWash: "#f1eeff",
    gi: "#0f766e",
    nogi: "#b45309",
    border: "#e7e5e4",
    input: "#e7e5e4",
    ring: "#a6a09b",
    info: "#2b7fff",
    warning: "#ff6900",
    error: "#fb2c36",
    success: "#00c950",
  },
  dark: {
    background: "#000000",
    foreground: "#fafaf9",
    card: "#0f0d0c",
    cardForeground: "#fafaf9",
    popover: "#0f0d0c",
    popoverForeground: "#fafaf9",
    primary: "#fafaf9",
    primaryForeground: "#1c1917",
    secondary: "#292524",
    secondaryForeground: "#fafaf9",
    muted: "#1a1917",
    mutedForeground: "#a6a09b",
    accent: "#1a1917",
    accentForeground: "#fafaf9",
    destructive: "#82181a",
    destructiveForeground: "#fafaf9",
    brand: "#8b72ff",
    brandStrong: "#a390ff",
    brandForeground: "#12091f",
    brandWash: "#17122e",
    gi: "#2dd4bf",
    nogi: "#f5a524",
    border: "#292524",
    input: "#292524",
    ring: "#79716b",
    info: "#2b7fff",
    warning: "#ff6900",
    error: "#fb2c36",
    success: "#00c950",
  },
} as const;
