/**
 * Inter typography: the mobile side of docs/design.md §1.2 + §3 ("Geist Mono is
 * the mat clock"). Inter for UI text; Geist Mono for machine/data values (class
 * times, capacity `18/24`, prices, streaks, reference codes). React Native can't
 * synthesize weights from one family — each weight is a separately loaded family,
 * so we map a numeric weight to its exact font-family name. The assets load once
 * in the root layout via `useFonts(fontAssets)`.
 */
import {
  GeistMono_400Regular,
  GeistMono_500Medium,
  GeistMono_600SemiBold,
  GeistMono_700Bold,
} from "@expo-google-fonts/geist-mono";
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";

/** Passed straight to `useFonts` — keys must equal the fontFamily strings. */
export const fontAssets = {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  GeistMono_400Regular,
  GeistMono_500Medium,
  GeistMono_600SemiBold,
  GeistMono_700Bold,
};

export type FontWeight = 400 | 500 | 600 | 700;

const SANS: Record<FontWeight, string> = {
  400: "Inter_400Regular",
  500: "Inter_500Medium",
  600: "Inter_600SemiBold",
  700: "Inter_700Bold",
};

const MONO: Record<FontWeight, string> = {
  400: "GeistMono_400Regular",
  500: "GeistMono_500Medium",
  600: "GeistMono_600SemiBold",
  700: "GeistMono_700Bold",
};

/** Inter (UI) font-family for a weight. */
export const sans = (weight: FontWeight = 400): string => SANS[weight];

/** Geist Mono (data) font-family for a weight. */
export const mono = (weight: FontWeight = 400): string => MONO[weight];
