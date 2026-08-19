import type { ReactNode } from "react";
import type {
  TextProps as RNTextProps,
  StyleProp,
  TextStyle,
  ViewStyle,
} from "react-native";
import { useState } from "react";
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
import { useTheme } from "./theme";

export { useTheme } from "./theme";
export type { Theme } from "./theme";

/**
 * The student app's UI kit — the mobile twin of the web `@matops/ui` +
 * `_components/primitives`. It renders the same design language on native:
 * Geist for text, **Geist Mono for data** (times, counts, prices — the "mat
 * clock", docs/design.md §3), the signature violet used only for identity, a
 * deliberately **tight 3px radius**, flat cards on a hairline border, and
 * dashed-stripe callouts. Colours come from `useTheme()` (design tokens for the
 * resolved scheme), so the whole kit follows the dark-first theme.
 *
 * Styling is explicit React Native, not NativeWind classes: NativeWind v5
 * (preview) drops spacing / flex / foreground colours on native (ADR 36), which
 * left labels unreadable. Explicit styles + tokens keep every screen correct.
 */

/** Shape: base radius is tight (web `--radius` 0.2rem ≈ 3px); pills are round. */
const RADIUS = 3;
const RADIUS_HERO = 6;
const PILL = 999;

type Tone =
  "default" | "muted" | "brand" | "info" | "warning" | "error" | "success";

function toneColor(t: Theme, tone: Tone): string {
  switch (tone) {
    case "muted":
      return t.mutedForeground;
    case "brand":
      return t.brandStrong;
    case "info":
      return t.info;
    case "warning":
      return t.warning;
    case "error":
      return t.error;
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
  /** Geist Mono — for any machine/data value. Defaults on = tabular figures. */
  data?: boolean;
  uppercase?: boolean;
  tracking?: number;
  lineHeight?: number;
  align?: TextStyle["textAlign"];
  numberOfLines?: number;
  selectable?: boolean;
  onPress?: RNTextProps["onPress"];
  style?: StyleProp<TextStyle>;
}

/** The one text primitive — every label/value flows through it so Geist is
 * applied consistently and data values pick up Geist Mono + tabular figures. */
export function Txt({
  children,
  size = 15,
  weight = 400,
  tone = "default",
  color,
  data = false,
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
        data && { fontVariant: ["tabular-nums"] },
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

/** Screen / section title — Geist semibold, tight-tracked, never bold-and-big. */
export function Heading({
  children,
  size = 26,
}: {
  children: ReactNode;
  size?: number;
}) {
  return (
    <Txt size={size} weight={600} tracking={-0.6}>
      {children}
    </Txt>
  );
}

/** Card / group title. */
export function Title({ children }: { children: ReactNode }) {
  return (
    <Txt size={17} weight={600} tracking={-0.2}>
      {children}
    </Txt>
  );
}

/** Secondary body copy. */
export function Muted({ children }: { children: ReactNode }) {
  return (
    <Txt size={14} tone="muted" lineHeight={20}>
      {children}
    </Txt>
  );
}

/** Mono uppercase metadata label — the web `Eyebrow` (design.md §1.2). */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <Txt data size={11} weight={600} tone="muted" uppercase tracking={0.8}>
      {children}
    </Txt>
  );
}

/** A data value in Geist Mono (times, counts, prices, capacity, streaks). */
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

/** A big mono stat over a mono label — the web `Stat` (members/dashboard). */
export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Mono size={22} weight={600}>
        {value}
      </Mono>
      <Eyebrow>{label}</Eyebrow>
    </View>
  );
}

/* --------------------------------------------------------------- layout --- */

/** Full-screen padded surface. Wrap every screen in this. */
export function Screen({
  children,
  center = false,
  avoidKeyboard = false,
  style,
}: {
  children: ReactNode;
  /** Centre content vertically (auth/onboarding screens). */
  center?: boolean;
  /** Lift content above the keyboard — for screens whose submit sits low. */
  avoidKeyboard?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const inner = (
    <View
      style={[
        { flex: 1, padding: 16 },
        center && { justifyContent: "center" },
        style,
      ]}
    >
      {children}
    </View>
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

/** Full-screen centred spinner — the loading state for a whole route/gate. */
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
      <ActivityIndicator color={t.brand} />
    </SafeAreaView>
  );
}

/**
 * Inline spinner — the loading state for a section or a screen body that already
 * sits inside a `Screen`. Unlike `Loading` it paints no new full-screen surface,
 * so it centres in the space it's given instead of covering the header.
 */
export function InlineLoading() {
  const t = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <ActivityIndicator color={t.brand} />
    </View>
  );
}

/** A hairline dashed rule — the design's "dashed divider" for card meta. */
export function DashedRule({ style }: { style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return (
    <View
      style={[
        { borderTopWidth: 1, borderStyle: "dashed", borderColor: t.border },
        style,
      ]}
    />
  );
}

/** A horizontal "or" divider (two rules + a label). */
export function OrDivider() {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: t.border }} />
      <Txt size={13} tone="muted">
        or
      </Txt>
      <View style={{ flex: 1, height: 1, backgroundColor: t.border }} />
    </View>
  );
}

/* ----------------------------------------------------------------- card --- */

type CardVariant = "filled" | "outline" | "hero";

/**
 * A surface. `filled` = a card surface for a static list item (the default);
 * `outline` = flush on the page background (navigate / act); `hero` = the one
 * featured brand-wash surface per screen. Flat — depth comes from the border,
 * never a shadow (design.md §1.4).
 */
export function Card({
  children,
  variant = "filled",
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
    variant === "hero"
      ? {
          backgroundColor: t.brandWash,
          borderWidth: 1,
          borderColor: t.brand,
          borderRadius: RADIUS_HERO,
        }
      : {
          backgroundColor: variant === "outline" ? "transparent" : t.card,
          borderWidth: 1,
          borderColor: t.border,
          borderRadius: RADIUS,
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

/* -------------------------------------------------------------- callout --- */

type CalloutTone = "info" | "warning" | "error" | "success" | "brand";

/**
 * A status strip with a coloured **dashed left stripe** (design.md §4). The
 * stripe carries meaning via a callout accent; body copy stays neutral. `brand`
 * is the identity tone (the S3 pending banner). Kept named `Banner` too for the
 * existing call sites.
 */
export function Callout({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: CalloutTone;
}) {
  const t = useTheme();
  const stripe =
    tone === "brand"
      ? t.brand
      : tone === "warning"
        ? t.warning
        : tone === "error"
          ? t.error
          : tone === "success"
            ? t.success
            : t.info;
  const bg = tone === "brand" ? t.brandWash : `${stripe}1a`;
  const textTone: Tone = tone === "brand" ? "brand" : "default";
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: bg,
        borderRadius: RADIUS,
        borderLeftWidth: 3,
        borderLeftColor: stripe,
        borderStyle: "dashed",
        padding: 12,
        paddingLeft: 14,
      }}
    >
      <Txt size={14} tone={textTone} lineHeight={20} style={{ flex: 1 }}>
        {children}
      </Txt>
    </View>
  );
}

/** Back-compat alias — the older `tone` names map onto the callout accents. */
export function Banner({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warning" | "success" | "brand";
}) {
  return <Callout tone={tone}>{children}</Callout>;
}

/* --------------------------------------------------------------- status --- */

/** A status dot + mono label (booking/dues/attendance state). */
export function StatusPill({
  tone,
  label,
}: {
  tone: "success" | "warning" | "error" | "info";
  label: string;
}) {
  const t = useTheme();
  const color = toneColor(t, tone);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: PILL,
        backgroundColor: t.muted,
      }}
    >
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: PILL,
          backgroundColor: color,
        }}
      />
      <Txt data size={11} weight={600} uppercase tracking={0.4}>
        {label}
      </Txt>
    </View>
  );
}

/** The brand "spark" count badge — "N things want you", never a data status. */
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
        backgroundColor: t.brand,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Txt data size={11} weight={600} color={t.brandForeground}>
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
          <Mono size={16}>{value ?? "—"}</Mono>
        ) : (
          <Txt size={16}>{value ?? "—"}</Txt>
        ))}
    </View>
  );
}

/* --------------------------------------------------------------- inputs --- */

type ButtonVariant = "primary" | "outline" | "ghost" | "destructive";

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  /** Shows a spinner + disables while a mutation is in flight. */
  loading?: boolean;
}) {
  const t = useTheme();
  const bg =
    variant === "primary"
      ? t.primary
      : variant === "destructive"
        ? t.destructive
        : variant === "outline"
          ? t.card
          : "transparent";
  const textColor =
    variant === "primary"
      ? t.primaryForeground
      : variant === "destructive"
        ? t.destructiveForeground
        : t.foreground;
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          minHeight: 48,
          borderRadius: RADIUS,
          paddingHorizontal: 16,
          paddingVertical: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          backgroundColor: bg,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        },
        variant === "outline" && { borderWidth: 1, borderColor: t.input },
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={textColor} /> : null}
      <Text style={{ fontFamily: sans(600), fontSize: 15, color: textColor }}>
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
      {/* UPPERCASE mono field label (design.md §4). */}
      <Eyebrow>{label}</Eyebrow>
      <TextInput
        accessibilityLabel={label}
        style={{
          minHeight: 48,
          borderRadius: RADIUS,
          borderWidth: 1,
          borderColor: focused ? t.brand : t.input,
          paddingHorizontal: 12,
          paddingVertical: 12,
          fontFamily: sans(400),
          fontSize: 16,
          color: t.foreground,
          backgroundColor: t.card,
        }}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={t.mutedForeground}
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
  const th = Math.max(1, size * 0.055);
  const half = size / 2;
  const seam = (s: ViewStyle) => (
    <View
      style={{
        position: "absolute",
        backgroundColor: t.brandForeground,
        opacity: 0.85,
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
        mat<Text style={{ color: t.brandStrong }}>ops</Text>
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
        gap: 8,
        borderRadius: RADIUS,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: t.border,
        padding: 16,
      }}
    >
      <Txt size={16} weight={500}>
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
        borderRadius: RADIUS,
        borderWidth: 1,
        borderColor: t.error,
        padding: 16,
      }}
    >
      <Txt size={16} weight={500}>{`Couldn't load ${label}.`}</Txt>
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
      <Txt size={14} weight={600} tone="brand">
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
          <Mono size={16}>{value}</Mono>
        ) : (
          <Txt size={16} selectable style={{ flex: 1 }}>
            {value}
          </Txt>
        )}
        <CopyButton value={value} />
      </View>
    </View>
  );
}
