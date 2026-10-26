import type { ReactNode } from "react";
import type {
  TextProps as RNTextProps,
  StyleProp,
  TextStyle,
  ViewStyle,
} from "react-native";
import { Children, isValidElement, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { FontWeight } from "./fonts";
import type { Theme } from "./theme";
import { mono, sans } from "./fonts";
import { MatLoader } from "./mat-loader";
import { useTheme } from "./theme";

export { useTheme } from "./theme";
export type { Theme } from "./theme";

/**
 * The student app's UI kit, the mobile twin of the web `@matops/ui` and
 * `_components/primitives`. Same shapes as the web (ADR 141): 8px cards and
 * lists, 5px controls, 4px badges, lit edges and a soft lift instead of
 * pills. Inter for text with tabular figures for times and counts; Geist Mono
 * only for codes. Colours come from `useTheme()`.
 *
 * Styling is explicit React Native, not NativeWind classes: NativeWind v5
 * (preview) drops spacing / flex / foreground colours on native (ADR 36), which
 * left labels unreadable. Explicit styles + tokens keep every screen correct.
 */

const RADIUS_CARD = 8;
const RADIUS_CONTROL = 5;
const RADIUS_BADGE = 4;
const PILL = 9999;

const LIFT: ViewStyle = {
  shadowColor: "#000000",
  shadowOpacity: 0.12,
  shadowRadius: 2,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
};

const FLOAT: ViewStyle = {
  shadowColor: "#000000",
  shadowOpacity: 0.18,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 4,
};

type Tone =
  | "default"
  | "secondary"
  | "muted"
  | "faint"
  | "info"
  | "warning"
  | "error"
  | "success";

function toneColor(t: Theme, tone: Tone): string {
  switch (tone) {
    case "secondary":
      return t.foregroundSecondary;
    case "muted":
      return t.mutedForeground;
    case "faint":
      return t.foregroundFaint;
    case "info":
      return t.info;
    case "warning":
      return t.warning;
    case "error":
      return t.errorText;
    case "success":
      return t.success;
    default:
      return t.foreground;
  }
}

/* ------------------------------------------------------------------ text --- */

interface TxtProps {
  children: ReactNode;
  size?: number;
  weight?: FontWeight;
  tone?: Tone;
  /** Explicit colour, overrides `tone`. */
  color?: string;
  /** Geist Mono, for codes and references. */
  data?: boolean;
  tabular?: boolean;
  uppercase?: boolean;
  tracking?: number;
  lineHeight?: number;
  align?: TextStyle["textAlign"];
  numberOfLines?: number;
  selectable?: boolean;
  onPress?: RNTextProps["onPress"];
  style?: StyleProp<TextStyle>;
}

/** The one text primitive: every label and value flows through it, so Inter is
 * applied everywhere. */
export function Txt({
  children,
  size = 15,
  weight = 400,
  tone = "default",
  color,
  data = false,
  tabular = false,
  uppercase = false,
  tracking,
  lineHeight,
  align,
  numberOfLines,
  selectable,
  onPress,
  style,
}: TxtProps) {
  const t = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      selectable={selectable}
      onPress={onPress}
      style={[
        {
          fontFamily: data ? mono(weight) : sans(weight),
          fontSize: size,
          color: color ?? toneColor(t, tone),
        },
        (data || tabular) && { fontVariant: ["tabular-nums"] },
        uppercase && { textTransform: "uppercase" },
        tracking != null && { letterSpacing: tracking },
        lineHeight != null && { lineHeight },
        align != null && { textAlign: align },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** Screen / section title: Inter semibold, tight-tracked, never bold-and-big. */
export function Heading({
  children,
  size = 24,
}: {
  children: ReactNode;
  size?: number;
}) {
  return (
    <Txt size={size} weight={600} tracking={-0.4}>
      {children}
    </Txt>
  );
}

/** Card / group title. */
export function Title({ children }: { children: ReactNode }) {
  return (
    <Txt size={17} weight={600} tracking={-0.25}>
      {children}
    </Txt>
  );
}

/** Secondary body copy. */
export function Muted({ children }: { children: ReactNode }) {
  return (
    <Txt size={13} tone="muted" lineHeight={19}>
      {children}
    </Txt>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <Txt size={13} weight={500} tone="muted">
      {children}
    </Txt>
  );
}

/** A code or reference in Geist Mono. */
export function Mono({
  children,
  size = 15,
  weight = 500,
  tone = "default",
  color,
}: {
  children: ReactNode;
  size?: number;
  weight?: FontWeight;
  tone?: Tone;
  color?: string;
}) {
  return (
    <Txt data size={size} weight={weight} tone={tone} color={color}>
      {children}
    </Txt>
  );
}

/* --------------------------------------------------------------- layout --- */

/** Full-screen padded surface. Wrap every screen in this. */
export function Screen({
  children,
  header,
  center = false,
  avoidKeyboard = false,
  style,
}: {
  children: ReactNode;
  /** A full-bleed bar above the padded content (the tab screens' `AppHeader`). */
  header?: ReactNode;
  /** Centre content vertically (auth/onboarding screens). */
  center?: boolean;
  /** Lift content above the keyboard — for screens whose submit sits low. */
  avoidKeyboard?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const inner = (
    <>
      {header}
      <View
        style={[
          { flex: 1, padding: 16 },
          center && { justifyContent: "center" },
          style,
        ]}
      >
        {children}
      </View>
    </>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
      {avoidKeyboard ? (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          {inner}
        </KeyboardAvoidingView>
      ) : (
        inner
      )}
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

/**
 * The full-screen gate — the **mat loader**, for a wait with nothing on screen
 * yet to be faithful to: the auth gate, the magic link, an invite opening
 * (ADR 80). `label` says what is happening, so use it wherever the wait is for
 * something nameable. Once a screen is drawn, the matching shape from
 * `skeletons.tsx` says more than any spinner can.
 */
export function Loading({ label }: { label?: string }) {
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
      <MatLoader label={label} />
    </SafeAreaView>
  );
}

/* ----------------------------------------------------------------- card --- */

type CardVariant = "flat" | "raised";

/**
 * A surface (web `cardClass`). `flat` sits on its own edge, a line in light
 * and none in dark. `raised` is the one featured panel per screen: a lit rim
 * and a float shadow.
 */
export function Card({
  children,
  variant = "flat",
  onPress,
  padded = true,
  style,
}: {
  children: ReactNode;
  variant?: CardVariant;
  onPress?: () => void;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const base: ViewStyle =
    variant === "raised"
      ? {
          ...FLOAT,
          backgroundColor: t.raised,
          borderWidth: 1,
          borderColor: t.edgeRim,
          borderRadius: RADIUS_CARD,
        }
      : {
          backgroundColor: t.card,
          borderWidth: 1,
          borderColor: t.cardEdge,
          borderRadius: RADIUS_CARD,
        };
  const box = [base, padded && { padding: 16 }, style];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [box, pressed && { opacity: 0.85 }]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={box}>{children}</View>;
}

export function List({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const rows = Children.toArray(children);
  return (
    <View
      style={[
        {
          backgroundColor: t.card,
          borderWidth: 1,
          borderColor: t.border,
          borderRadius: RADIUS_CARD,
          overflow: "hidden",
        },
        style,
      ]}
    >
      {rows.map((row, i) => (
        <View
          key={isValidElement(row) && row.key != null ? row.key : i}
          style={
            i > 0 ? { borderTopWidth: 1, borderTopColor: t.border } : undefined
          }
        >
          {row}
        </View>
      ))}
    </View>
  );
}

export function ListRow({
  children,
  onPress,
  accessibilityLabel,
  style,
}: {
  children: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const box: StyleProp<ViewStyle> = [
    { minHeight: 44, paddingVertical: 12, paddingHorizontal: 14 },
    style,
  ];
  if (!onPress) return <View style={box}>{children}</View>;
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [box, pressed && { backgroundColor: t.hover }]}
    >
      {children}
    </Pressable>
  );
}

/* -------------------------------------------------------------- callout --- */

type CalloutTone = "info" | "warning" | "error" | "success" | "neutral";

/**
 * A status strip on a light tint of its accent, with a matching edge (the web
 * `Callout`). Body copy stays neutral; `title` is the one bold line.
 */
export function Callout({
  children,
  title,
  tone = "neutral",
}: {
  children?: ReactNode;
  title?: string;
  tone?: CalloutTone;
}) {
  const t = useTheme();
  const hue =
    tone === "warning"
      ? t.warning
      : tone === "error"
        ? t.error
        : tone === "success"
          ? t.success
          : tone === "info"
            ? t.info
            : null;
  return (
    <View
      accessibilityRole={tone === "error" ? "alert" : undefined}
      style={{
        gap: 2,
        backgroundColor: hue ? `${hue}12` : t.surface1,
        borderRadius: RADIUS_CARD,
        borderWidth: 1,
        borderColor: hue ? `${hue}4d` : t.border,
        padding: 12,
      }}
    >
      {title ? (
        <Txt size={13} weight={500} lineHeight={19}>
          {title}
        </Txt>
      ) : null}
      {typeof children === "string" ? (
        <Txt size={13} tone="secondary" lineHeight={19}>
          {children}
        </Txt>
      ) : (
        children
      )}
    </View>
  );
}

/* --------------------------------------------------------------- status --- */

type BadgeTone = "neutral" | "info" | "lit" | "success" | "warning" | "error";

export function Badge({
  label,
  tone = "neutral",
  icon,
}: {
  label: string;
  tone?: BadgeTone;
  icon?: ReactNode;
}) {
  const t = useTheme();
  const hue =
    tone === "info"
      ? t.info
      : tone === "success"
        ? t.success
        : tone === "warning"
          ? t.warning
          : tone === "error"
            ? t.error
            : null;
  const edge =
    tone === "lit" ? `${t.foreground}59` : hue ? `${hue}4d` : t.borderStrong;
  const fill =
    tone === "lit" ? `${t.foreground}12` : hue ? `${hue}1a` : t.surface2;
  const text =
    tone === "lit"
      ? t.foreground
      : tone === "error"
        ? t.errorText
        : (hue ?? t.foregroundSecondary);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        minHeight: 22,
        paddingHorizontal: 6,
        borderRadius: RADIUS_BADGE,
        borderWidth: 1,
        borderColor: edge,
        backgroundColor: fill,
      }}
    >
      {icon}
      <Txt size={12} weight={500} color={text}>
        {label}
      </Txt>
    </View>
  );
}

export function Meter({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label: string;
}) {
  const t = useTheme();
  const share = max > 0 ? Math.max(0, Math.min(value / max, 1)) : 0;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max, now: Math.min(value, max) }}
      style={{
        height: 4,
        borderRadius: 2,
        backgroundColor: t.track,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          width: `${share * 100}%`,
          height: "100%",
          backgroundColor: t.meter,
        }}
      />
    </View>
  );
}

/** The count badge: "N things want you", never a data status. */
export function CountBadge({ count }: { count: number }) {
  const t = useTheme();
  if (count <= 0) return null;
  return (
    <View
      style={{
        minWidth: 20,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: PILL,
        backgroundColor: t.active,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Txt size={12} weight={600} tabular>
        {count}
      </Txt>
    </View>
  );
}

/** A section header row: title + optional count badge (web `SectionHeading`). */
export function SectionHeading({
  children,
  count = 0,
}: {
  children: ReactNode;
  count?: number;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <Title>{children}</Title>
      <CountBadge count={count} />
    </View>
  );
}

/** One labelled fact row — Eyebrow label over its value (deduped from screens). */
export function Field({
  label,
  value,
  children,
  data = false,
}: {
  label: string;
  /** Plain string value; renders mono when `data`. Use `children` for nodes. */
  value?: string;
  children?: ReactNode;
  data?: boolean;
}) {
  return (
    <View style={{ gap: 4 }}>
      <Eyebrow>{label}</Eyebrow>
      {children ??
        (data ? (
          <Mono size={15}>{value ?? "Not provided"}</Mono>
        ) : (
          <Txt size={15}>{value ?? "Not provided"}</Txt>
        ))}
    </View>
  );
}

/* --------------------------------------------------------------- inputs --- */

type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive"
  | "destructive-outline";

function buttonColors(t: Theme, variant: ButtonVariant) {
  switch (variant) {
    case "primary":
      return { bg: t.primary, edge: t.primary, text: t.primaryForeground };
    case "secondary":
      return { bg: t.surface2, edge: t.edgeLit, text: t.secondaryForeground };
    case "outline":
      return { bg: "transparent", edge: t.borderStrong, text: t.foreground };
    case "ghost":
      return {
        bg: "transparent",
        edge: "transparent",
        text: t.mutedForeground,
      };
    case "destructive":
      return {
        bg: t.destructive,
        edge: t.destructive,
        text: t.destructiveForeground,
      };
    case "destructive-outline":
      return { bg: `${t.error}1a`, edge: `${t.error}4d`, text: t.errorText };
  }
}

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  icon,
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Shows a spinner + disables while a mutation is in flight. */
  loading?: boolean;
  icon?: ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const c = buttonColors(t, variant);
  const isDisabled = disabled || loading;
  const lifted = variant === "primary" || variant === "secondary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        lifted && LIFT,
        {
          minHeight: 44,
          borderRadius: RADIUS_CONTROL,
          borderWidth: 1,
          borderColor: c.edge,
          paddingHorizontal: 14,
          paddingVertical: 10,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          backgroundColor: c.bg,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        },
        pressed &&
          !isDisabled &&
          (variant === "outline" || variant === "ghost") && {
            backgroundColor: t.hover,
          },
        style,
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={c.text} /> : icon}
      <Text style={{ fontFamily: sans(500), fontSize: 15, color: c.text }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function IconButton({
  label,
  onPress,
  children,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: RADIUS_CONTROL,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.5 : 1,
        backgroundColor: pressed ? t.hover : "transparent",
      })}
    >
      {children}
    </Pressable>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange: (next: T) => void;
  tabs: { id: T; label: string }[];
}) {
  const t = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        gap: 4,
        borderBottomWidth: 1,
        borderBottomColor: t.border,
      }}
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(tab.id)}
            style={{
              minHeight: 44,
              paddingHorizontal: 12,
              justifyContent: "center",
              borderBottomWidth: 2,
              borderBottomColor: active ? t.foreground : "transparent",
              marginBottom: -1,
            }}
          >
            <Txt
              size={15}
              weight={500}
              tabular
              tone={active ? "default" : "muted"}
            >
              {tab.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SettingsRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 16,
        padding: 16,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Txt size={15} weight={500}>
          {title}
        </Txt>
        {description ? <Muted>{description}</Muted> : null}
      </View>
      {children}
    </View>
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
  maxLength,
  textContentType,
  returnKeyType,
  onSubmitEditing,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: "default" | "email-address" | "phone-pad";
  autoFocus?: boolean;
  maxLength?: number;
  /** iOS autofill hint (e.g. "emailAddress", "givenName", "telephoneNumber"). */
  textContentType?: React.ComponentProps<typeof TextInput>["textContentType"];
  returnKeyType?: React.ComponentProps<typeof TextInput>["returnKeyType"];
  onSubmitEditing?: () => void;
}) {
  const t = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <Txt size={13} weight={500} tone="secondary">
        {label}
      </Txt>
      <TextInput
        accessibilityLabel={label}
        style={{
          minHeight: 44,
          borderRadius: RADIUS_CONTROL,
          borderWidth: 1,
          borderColor: focused ? t.ring : t.input,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontFamily: sans(400),
          fontSize: 15,
          color: t.foreground,
          backgroundColor: t.raised,
        }}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={t.foregroundFaint}
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        maxLength={maxLength}
        textContentType={textContentType}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
      />
    </View>
  );
}

/* ----------------------------------------------------------------- logo --- */

/**
 * The matops mark — a rounded tile of a **basketweave** mat bond, drawn with
 * positioned Views (no SVG dep). Fill + seams follow the theme. Mirrors the web
 * `@matops/ui/logo` (design.md §6, ADR 37).
 */
export function Mark({ size = 24 }: { size?: number }) {
  const t = useTheme();
  const th = Math.max(1, size * 0.034);
  const half = size / 2;
  const seam = (s: ViewStyle) => (
    <View
      style={{
        position: "absolute",
        backgroundColor: t.brandForeground,
        opacity: 0.92,
        shadowColor: t.brandForeground,
        shadowOpacity: 0.6,
        shadowRadius: size / 32,
        shadowOffset: { width: 0, height: 0 },
        ...s,
      }}
    />
  );
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.22,
        backgroundColor: t.brand,
        borderWidth: 1,
        borderColor: `${t.brandForeground}4d`,
        overflow: "hidden",
      }}
    >
      {seam({ left: half - th / 2, top: 0, width: th, height: size })}
      {seam({ top: half - th / 2, left: 0, width: size, height: th })}
      {seam({ left: size * 0.2656 - th / 2, top: 0, width: th, height: half })}
      {seam({
        top: size * 0.2656 - th / 2,
        left: half,
        width: half,
        height: th,
      })}
      {seam({ top: size * 0.7344 - th / 2, left: 0, width: half, height: th })}
      {seam({
        left: size * 0.7344 - th / 2,
        top: half,
        width: th,
        height: half,
      })}
    </View>
  );
}

/** Mark + `matops` wordmark lockup — "ops" carries the brand-strong accent. */
export function Logo({ size = 24 }: { size?: number }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
      <Mark size={size} />
      <Text
        style={{
          fontFamily: sans(600),
          fontSize: 18,
          letterSpacing: -0.4,
          color: t.foreground,
        }}
      >
        Mat<Text style={{ color: t.brandStrong }}>Ops</Text>
      </Text>
    </View>
  );
}

/**
 * Blueprint backdrop — a whisper-quiet hairline grid (the "mat diagram", design
 * .md §2). Measures itself, then tiles `--border` lines behind a hero. Use at
 * most one per view, behind non-text areas.
 */
export function Blueprint({
  cell = 28,
  opacity = 0.6,
  style,
}: {
  cell?: number;
  opacity?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const cols = Math.ceil(size.w / cell);
  const rows = Math.ceil(size.h / cell);
  return (
    <View
      pointerEvents="none"
      onLayout={(e) =>
        setSize({
          w: e.nativeEvent.layout.width,
          h: e.nativeEvent.layout.height,
        })
      }
      style={[
        { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity },
        style,
      ]}
    >
      {Array.from({ length: cols }, (_, i) => (
        <View
          key={`v${i}`}
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: i * cell,
            width: 1,
            backgroundColor: t.border,
          }}
        />
      ))}
      {Array.from({ length: rows }, (_, i) => (
        <View
          key={`h${i}`}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: i * cell,
            height: 1,
            backgroundColor: t.border,
          }}
        />
      ))}
    </View>
  );
}

/* ---------------------------------------------------------- empty/error --- */

/**
 * Empty state — an invitation to the next action. `title` names what's absent;
 * `body` says what to do.
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
        gap: 6,
        borderRadius: RADIUS_CARD,
        borderWidth: 1,
        borderColor: t.border,
        backgroundColor: t.surface1,
        padding: 16,
      }}
    >
      <Txt size={15} weight={500}>
        {title}
      </Txt>
      {body ? <Muted>{body}</Muted> : null}
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
        borderRadius: RADIUS_CARD,
        borderWidth: 1,
        borderColor: `${t.error}4d`,
        backgroundColor: `${t.error}14`,
        padding: 16,
      }}
    >
      <Txt size={15} weight={500}>{`Couldn't load ${label}.`}</Txt>
      <Muted>Check your connection and try again.</Muted>
      {onRetry ? (
        <Button label="Try again" variant="outline" onPress={onRetry} />
      ) : null}
    </View>
  );
}

/* --------------------------------------------------------------- confirm --- */

/**
 * A destructive-action confirm — the native twin of the web `ConfirmDialog`.
 * There's no in-app modal on mobile; the platform `Alert` is the right guard, so
 * every irreversible tap (cancel a booking, sign out, submit a payment claim)
 * routes through this instead of firing straight away. The confirm button is
 * styled `destructive` on iOS by default.
 */
export function confirm({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = true,
  onConfirm,
}: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  Alert.alert(title, message, [
    { text: cancelLabel, style: "cancel" },
    {
      text: confirmLabel,
      style: destructive ? "destructive" : "default",
      onPress: onConfirm,
    },
  ]);
}

/* ------------------------------------------------------------------ copy --- */

/**
 * Copy-to-clipboard control — the native twin of the web `CopyButton`. A real
 * 44px tap target, an accessible name, and a brief "Copied ✓" state so the tap
 * has a visible result. `expo-clipboard` is imported lazily + guarded so a dev
 * client built before it was added doesn't crash the route (a top-level import
 * would); the copy is a quiet no-op there.
 */
export function CopyButton({
  value,
  label = "Copy",
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    void import("expo-clipboard")
      .then((Clipboard) => Clipboard.setStringAsync(value))
      .catch(() => undefined);
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={copied ? "Copied" : `Copy ${label.toLowerCase()}`}
      onPress={copy}
      hitSlop={12}
      style={{ minHeight: 44, justifyContent: "center" }}
    >
      <Txt size={13} weight={500}>
        {copied ? "Copied ✓" : label}
      </Txt>
    </Pressable>
  );
}

/** A labelled value with a copy control — Eyebrow label over value + `CopyButton`. */
export function CopyField({
  label,
  value,
  data = false,
}: {
  label: string;
  value: string;
  data?: boolean;
}) {
  return (
    <View style={{ gap: 4 }}>
      <Eyebrow>{label}</Eyebrow>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        {data ? (
          <Mono size={15}>{value}</Mono>
        ) : (
          <Txt size={15} selectable style={{ flex: 1 }}>
            {value}
          </Txt>
        )}
        <CopyButton value={value} />
      </View>
    </View>
  );
}
