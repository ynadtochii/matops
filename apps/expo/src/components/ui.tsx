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
 * The student app's UI kit — the mobile twin of the web `@matops/ui` +
 * `_components/primitives`. It renders the same design language on native:
 * Inter for text, **Geist Mono for data** (times, counts, prices: the "mat
 * clock", docs/design.md §3), the signature violet used only for identity,
 * radius by nesting (ADR 141), flat cards on a hairline border, and tinted
 * callouts. Colours come from `useTheme()` (design tokens for the
 * resolved scheme), so the whole kit follows the dark-first theme.
 *
 * Styling is explicit React Native, not NativeWind classes: NativeWind v5
 * (preview) drops spacing / flex / foreground colours on native (ADR 36), which
 * left labels unreadable. Explicit styles + tokens keep every screen correct.
 */

const RADIUS_CARD = 12;
const RADIUS_ROW = 8;
const RADIUS_FIELD = 6;
const PILL = 9999;

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

/** The one text primitive: every label/value flows through it so Inter is
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
      <Mono size={22} weight={500}>
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
 * featured raised surface per screen. Flat: depth comes from the border,
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
  const base: ViewStyle = {
    backgroundColor:
      variant === "hero"
        ? t.raised
        : variant === "outline"
          ? "transparent"
          : t.card,
    borderWidth: 1,
    borderColor: variant === "hero" ? t.borderStrong : t.border,
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
 * A status strip on a light tint of its callout accent, with a matching
 * hairline edge (the web `Callout`). Body copy stays neutral. `neutral` is the
 * S3 pending banner. Kept named `Banner` too for the existing call sites.
 */
function Callout({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: CalloutTone;
}) {
  const t = useTheme();
  const hue =
    tone === "neutral"
      ? t.border
      : tone === "warning"
        ? t.warning
        : tone === "error"
          ? t.error
          : tone === "success"
            ? t.success
            : t.info;
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: tone === "neutral" ? t.surface1 : `${hue}14`,
        borderRadius: RADIUS_ROW,
        borderWidth: 1,
        borderColor: tone === "neutral" ? t.border : `${hue}4d`,
        padding: 12,
      }}
    >
      <Txt size={13} tone="secondary" lineHeight={19} style={{ flex: 1 }}>
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
  tone?: CalloutTone;
}) {
  return <Callout tone={tone}>{children}</Callout>;
}

/* --------------------------------------------------------------- status --- */

export function StatusPill({
  tone,
  label,
}: {
  tone: "success" | "warning" | "error" | "info" | "neutral";
  label: string;
}) {
  const t = useTheme();
  const hue =
    tone === "success"
      ? t.success
      : tone === "warning"
        ? t.warning
        : tone === "error"
          ? t.error
          : tone === "info"
            ? t.info
            : null;
  const text =
    tone === "error"
      ? t.errorText
      : tone === "neutral"
        ? t.foregroundSecondary
        : (hue ?? t.foreground);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: PILL,
        borderWidth: 1,
        borderColor: hue ? `${hue}4d` : t.border,
        backgroundColor: hue ? `${hue}1a` : t.secondary,
      }}
    >
      <Txt size={12} weight={500} color={text}>
        {label}
      </Txt>
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
      <Txt size={12} weight={600} style={{ fontVariant: ["tabular-nums"] }}>
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
          <Mono size={15}>{value ?? "—"}</Mono>
        ) : (
          <Txt size={15}>{value ?? "—"}</Txt>
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
        ? `${t.error}1a`
        : "transparent";
  const edge =
    variant === "primary"
      ? t.primary
      : variant === "destructive"
        ? `${t.error}4d`
        : variant === "outline"
          ? t.borderStrong
          : "transparent";
  const textColor =
    variant === "primary"
      ? t.primaryForeground
      : variant === "destructive"
        ? t.errorText
        : variant === "ghost"
          ? t.mutedForeground
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
          minHeight: 44,
          borderRadius: PILL,
          borderWidth: 1,
          borderColor: edge,
          paddingHorizontal: 18,
          paddingVertical: 10,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          backgroundColor: bg,
          opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1,
        },
        pressed &&
          !isDisabled &&
          variant !== "primary" &&
          variant !== "destructive" && { backgroundColor: t.hover },
      ]}
    >
      {loading ? <ActivityIndicator size="small" color={textColor} /> : null}
      <Text style={{ fontFamily: sans(500), fontSize: 15, color: textColor }}>
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
      <Txt size={13} weight={500} tone="secondary">
        {label}
      </Txt>
      <TextInput
        accessibilityLabel={label}
        style={{
          minHeight: 44,
          borderRadius: RADIUS_FIELD,
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
  const th = Math.max(1, size * 0.05);
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
