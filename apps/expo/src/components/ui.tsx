import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * A tiny NativeWind RN UI kit for the student app — the mobile twin of the web
 * `@matops/ui`. Class names use the shared theme tokens (`bg-background`,
 * `text-foreground`, `bg-muted`, `text-primary`, `text-destructive`,
 * `text-muted-foreground`) so light/dark follow the same palette as the web.
 */

/** Header colors for the expo-router Stack (which needs hex, not classNames). */
export const headerColors = {
  light: { bg: "#ffffff", tint: "#0c0a09" },
  dark: { bg: "#0a0908", tint: "#fafaf9" },
};

/** Full-screen padded surface. Wrap every screen in this. */
export function Screen({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <SafeAreaView className="bg-background flex-1">
      <View className={`flex-1 p-4 ${className}`}>{children}</View>
    </SafeAreaView>
  );
}

/** Centered spinner — the loading state between auth/query resolutions. */
export function Loading() {
  return (
    <SafeAreaView className="bg-background flex-1 items-center justify-center">
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
  className = "",
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  className?: string;
}) {
  const base =
    "h-11 items-center justify-center rounded-md px-4 flex-row gap-2";
  const byVariant: Record<ButtonVariant, string> = {
    primary: "bg-primary",
    outline: "border border-input bg-background",
    ghost: "bg-transparent",
  };
  const textByVariant: Record<ButtonVariant, string> = {
    primary: "text-primary-foreground",
    outline: "text-foreground",
    ghost: "text-foreground",
  };
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      className={`${base} ${byVariant[variant]} ${disabled ? "opacity-50" : ""} ${className}`}
    >
      <Text className={`text-base font-medium ${textByVariant[variant]}`}>
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
  return (
    <View className="gap-1.5">
      <Text className="text-foreground text-sm font-medium">{label}</Text>
      <TextInput
        className="border-input bg-background text-foreground h-11 rounded-md border px-3 text-base"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#79716b"
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
      />
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
  const toneClass =
    tone === "warning"
      ? "bg-muted border-l-4 border-destructive"
      : tone === "success"
        ? "bg-muted border-l-4 border-primary"
        : "bg-muted";
  return (
    <View className={`rounded-md p-3 ${toneClass}`}>
      <Text className="text-muted-foreground text-sm">{children}</Text>
    </View>
  );
}

/** Section/screen heading. */
export function Heading({ children }: { children: ReactNode }) {
  return <Text className="text-foreground text-2xl font-bold">{children}</Text>;
}

/** Secondary/muted body copy. */
export function Muted({ children }: { children: ReactNode }) {
  return <Text className="text-muted-foreground text-sm">{children}</Text>;
}
