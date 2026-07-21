import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * A tiny RN UI kit for the student app — the mobile twin of the web
 * `@matops/ui`. The palette mirrors the shared design tokens
 * (`@matops/tailwind-config/theme`), so light/dark follow the same colors as the
 * web.
 *
 * NOTE on styling: these primitives use **explicit React Native styles**, not
 * NativeWind classes. NativeWind v5 (preview) does not reliably translate every
 * utility on native (spacing, flex alignment, and foreground colors were
 * dropping), which left buttons cramped and their labels unreadable. Explicit
 * styles keep the login/logout and join screens correct regardless. Colors come
 * from `useTheme()` so both schemes render right.
 */

/** Design tokens (mirror tooling/tailwind/theme.css). */
const light = {
  background: "#ffffff",
  foreground: "#0c0a09",
  primary: "#1c1917",
  primaryForeground: "#fafaf9",
  muted: "#f5f5f4",
  mutedForeground: "#79716b",
  border: "#e7e5e4",
  input: "#e7e5e4",
  destructive: "#e40014",
};

const dark: typeof light = {
  background: "#000000",
  foreground: "#fafaf9",
  primary: "#fafaf9",
  primaryForeground: "#1c1917",
  muted: "#292524",
  mutedForeground: "#a6a09b",
  border: "#292524",
  input: "#292524",
  destructive: "#fb2c36",
};

export type Theme = typeof light;

/** The active palette for the device color scheme. */
export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}

const RADIUS = 8;

/** Header colors for the expo-router Stack (which needs hex, not classNames). */
export const headerColors = {
  light: { bg: light.background, tint: light.foreground },
  dark: { bg: dark.background, tint: dark.foreground },
};

/** Full-screen padded surface. Wrap every screen in this. */
export function Screen({
  children,
  center = false,
  className = "",
  style,
}: {
  children: ReactNode;
  /** Center content vertically (auth/onboarding screens). */
  center?: boolean;
  /** Legacy NativeWind classes for screens not yet ported to explicit styles. */
  className?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
      <View
        className={className}
        style={[
          { flex: 1, padding: 16 },
          center && { justifyContent: "center" },
          style,
        ]}
      >
        {children}
      </View>
    </SafeAreaView>
  );
}

/** Vertical (or horizontal) stack with a reliable gap. */
export function Stack({
  children,
  gap = 12,
  row = false,
  center = false,
  style,
}: {
  children: ReactNode;
  gap?: number;
  row?: boolean;
  center?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        { gap, flexDirection: row ? "row" : "column" },
        center && { alignItems: "center" },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Centered spinner — the loading state between auth/query resolutions. */
export function Loading() {
  const t = useTheme();
  return (
    <SafeAreaView
      style={{
        flex: 1,
        backgroundColor: t.background,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ActivityIndicator />
    </SafeAreaView>
  );
}

type ButtonVariant = "primary" | "outline" | "ghost";

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
}) {
  const t = useTheme();
  const bg =
    variant === "primary" ? t.primary : variant === "outline" ? t.background : "transparent";
  const textColor = variant === "primary" ? t.primaryForeground : t.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          height: 48,
          borderRadius: RADIUS,
          paddingHorizontal: 16,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          backgroundColor: bg,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        variant === "outline" && { borderWidth: 1, borderColor: t.input },
      ]}
    >
      <Text style={{ fontSize: 16, fontWeight: "600", color: textColor }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  autoCapitalize = "sentences",
  keyboardType = "default",
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: "default" | "email-address" | "phone-pad";
  autoFocus?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 14, fontWeight: "500", color: t.foreground }}>
        {label}
      </Text>
      <TextInput
        style={{
          height: 48,
          borderRadius: RADIUS,
          borderWidth: 1,
          borderColor: t.input,
          paddingHorizontal: 12,
          fontSize: 16,
          color: t.foreground,
          backgroundColor: t.background,
        }}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.mutedForeground}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
      />
    </View>
  );
}

/** A horizontal "or" divider (two rules + a label). */
export function OrDivider() {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: t.border }} />
      <Text style={{ fontSize: 13, color: t.mutedForeground }}>or</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: t.border }} />
    </View>
  );
}

type BannerTone = "info" | "warning" | "success";

/** A slim status strip (spec S3 pending banner). */
export function Banner({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: BannerTone;
}) {
  const t = useTheme();
  const accent =
    tone === "warning" ? t.destructive : tone === "success" ? t.primary : null;
  return (
    <View
      style={[
        { backgroundColor: t.muted, borderRadius: RADIUS, padding: 12 },
        accent && { borderLeftWidth: 4, borderLeftColor: accent },
      ]}
    >
      <Text style={{ fontSize: 14, color: t.mutedForeground }}>{children}</Text>
    </View>
  );
}

/** Section/screen heading. */
export function Heading({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Text style={{ fontSize: 24, fontWeight: "700", color: t.foreground }}>
      {children}
    </Text>
  );
}

/** Secondary/muted body copy. */
export function Muted({ children }: { children: ReactNode }) {
  const t = useTheme();
  return (
    <Text style={{ fontSize: 14, color: t.mutedForeground, lineHeight: 20 }}>
      {children}
    </Text>
  );
}

/**
 * Empty state — an invitation to the next action (slice 4.3, the mobile twin of
 * the web `EmptyState`). `title` names what's absent; `body` says what to do.
 */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        gap: 8,
        borderRadius: RADIUS,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: t.border,
        padding: 16,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: "500", color: t.foreground }}>
        {title}
      </Text>
      {body ? (
        <Text style={{ fontSize: 14, color: t.mutedForeground }}>{body}</Text>
      ) : null}
      {action ? <View style={{ paddingTop: 4 }}>{action}</View> : null}
    </View>
  );
}

/**
 * Error state — names what failed and offers a retry, kept distinct from
 * EmptyState so "couldn't load" never reads as "nothing here". No apology.
 */
export function ErrorState({
  label,
  onRetry,
}: {
  label: string;
  onRetry?: () => void;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        gap: 8,
        borderRadius: RADIUS,
        borderWidth: 1,
        borderColor: t.destructive,
        padding: 16,
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: "500", color: t.foreground }}>
        {`Couldn't load ${label}.`}
      </Text>
      <Text style={{ fontSize: 14, color: t.mutedForeground }}>
        Check your connection and try again.
      </Text>
      {onRetry ? (
        <Button label="Try again" variant="outline" onPress={onRetry} />
      ) : null}
    </View>
  );
}
