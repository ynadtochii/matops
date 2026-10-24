import * as React from "react";
import { Appearance } from "react-native";
import * as SecureStore from "expo-secure-store";

import { tokens } from "@matops/ui/tokens";

/**
 * Mobile theme — the RN twin of the web `@matops/ui/theme` (docs/design.md §1.1).
 *
 * The app is **dark-first**: it opens on the dark palette (ADR 141) and
 * stays there unless the student picks Light or System in Profile. The three
 * modes mirror the web toggle (light / dark / auto), and the choice persists.
 *
 */

export type ThemeMode = "light" | "dark" | "auto";
export type ResolvedTheme = "light" | "dark";
/** The active palette — every token key resolved to a hex string. */
export type Theme = Record<keyof (typeof tokens)["dark"], string>;

const STORE_KEY = "theme-mode";

/** Dark-first: the palette shown until the stored preference (if any) loads. */
const DEFAULT_MODE: ThemeMode = "dark";

/** The palette for the resolved scheme. */
const palette = (resolved: ResolvedTheme): Theme =>
  resolved === "dark" ? tokens.dark : tokens.light;

const isMode = (v: string | null): v is ThemeMode =>
  v === "light" || v === "dark" || v === "auto";

const systemScheme = (): ResolvedTheme =>
  Appearance.getColorScheme() === "light" ? "light" : "dark";

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  theme: Theme;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: React.PropsWithChildren) {
  const [mode, setModeState] = React.useState<ThemeMode>(DEFAULT_MODE);
  const [system, setSystem] = React.useState<ResolvedTheme>(systemScheme);

  // Load the stored preference once. Until it resolves the app stays dark.
  React.useEffect(() => {
    let active = true;
    void SecureStore.getItemAsync(STORE_KEY).then((stored) => {
      if (active && isMode(stored)) setModeState(stored);
    });
    return () => {
      active = false;
    };
  }, []);

  // Apply the scheme to RN. `auto` = clear the override.
  // This only syncs an external system (Appearance) — no React state changes.
  React.useEffect(() => {
    Appearance.setColorScheme(mode === "auto" ? null : mode);
  }, [mode]);

  // Follow the OS while in `auto` (setState lives in the listener callback).
  React.useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) =>
      setSystem(colorScheme === "light" ? "light" : "dark"),
    );
    return () => sub.remove();
  }, []);

  const resolved: ResolvedTheme = mode === "auto" ? system : mode;

  const setMode = React.useCallback((next: ThemeMode) => {
    setModeState(next);
    void SecureStore.setItemAsync(STORE_KEY, next);
    // Re-read the OS scheme when handing control back to it (event handler, so
    // no cascading-render concern).
    if (next === "auto") setSystem(systemScheme());
  }, []);

  const value = React.useMemo<ThemeContextValue>(
    () => ({ mode, resolved, theme: palette(resolved), setMode }),
    [mode, resolved, setMode],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

/** Mode + setter for the Appearance control (Profile). */
export function useThemeMode(): ThemeContextValue {
  const ctx = React.use(ThemeContext);
  if (!ctx) throw new Error("useThemeMode must be used within a ThemeProvider");
  return ctx;
}

/** The active palette (design tokens for the resolved scheme). Dark by default. */
export function useTheme(): Theme {
  const ctx = React.use(ThemeContext);
  return ctx ? ctx.theme : tokens.dark;
}
