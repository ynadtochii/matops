import type { ReactNode } from "react";
import { useEffect } from "react";
import { Animated, View } from "react-native";

import { useReducedMotion } from "./mat-loader";
import { useTheme } from "./theme";
import { Card } from "./ui";

/**
 * The loading vocabulary (ADR 80), the mobile twin of the web
 * `_components/skeletons.tsx`. Two tiers here, not three: Expo Router has no
 * route-level loading boundary, so a screen's own `isPending` is the only place
 * a placeholder goes.
 *
 *  1. No chrome yet — the auth gate, the magic link, an invite opening: the
 *     `Loading` gate in `ui.tsx`, which draws the mat loader.
 *  2. Data filling into a drawn screen: the shapes below, each cut from the
 *     component it replaces, so nothing re-flows when the data lands.
 *
 * A spinner still belongs on an action in flight (a button, the onboarding gym
 * search): that is feedback for something the person just did, not a stand-in
 * for content whose shape we already know.
 *
 * When a real shape changes, change its skeleton in the same edit.
 */

/* One pulse for the whole app, so every bar on a screen breathes together (the
   web gets this free from a shared CSS keyframe). Ref-counted: the loop runs
   only while something is on screen. */
const pulse = new Animated.Value(0);
let mounted = 0;
let loop: Animated.CompositeAnimation | null = null;

function usePulse(reduced: boolean): Animated.Value {
  useEffect(() => {
    if (reduced) return;
    mounted += 1;
    if (mounted === 1) {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      );
      loop.start();
    }
    return () => {
      mounted -= 1;
      if (mounted === 0) {
        loop?.stop();
        loop = null;
        pulse.setValue(0);
      }
    };
  }, [reduced]);
  return pulse;
}

/** One muted block. Every skeleton is built from these. */
export function Bar({
  width,
  height = 14,
  radius = 3,
}: {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
}) {
  const t = useTheme();
  const reduced = useReducedMotion();
  const p = usePulse(reduced);
  return (
    <Animated.View
      style={{
        width,
        height,
        borderRadius: radius,
        backgroundColor: t.muted,
        opacity: reduced
          ? 0.7
          : p.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }),
      }}
    />
  );
}

/** The root of a screen skeleton — one "Loading" for the screen reader. */
function Frame({ gap = 20, children }: { gap?: number; children: ReactNode }) {
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Loading"
      style={{ gap }}
    >
      {children}
    </View>
  );
}

/* --------------------------------------------------------------- the parts */

/** The day rule: real hairlines around a placeholder label. */
export function SkeletonDayRule({ meta = true }: { meta?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ width: 16, height: 1, backgroundColor: t.border }} />
      <Bar width={64} height={11} />
      <View style={{ flex: 1, height: 1, backgroundColor: t.border }} />
      {meta ? <Bar width={52} height={11} /> : null}
    </View>
  );
}

/**
 * A class row on the schedule: the discipline rail, the time column, the title
 * and its meta line, and the row's own button.
 */
export function SkeletonClassRow({ action = true }: { action?: boolean }) {
  const t = useTheme();
  return (
    <Card padded={false} style={{ overflow: "hidden" }}>
      <View style={{ flexDirection: "row", alignItems: "stretch" }}>
        <View style={{ width: 3, backgroundColor: t.border }} />
        <View
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingVertical: 12,
            paddingHorizontal: 12,
          }}
        >
          <View style={{ width: 48, alignItems: "flex-end", gap: 4 }}>
            <Bar width={38} height={15} />
            <Bar width={20} height={9} />
          </View>
          <View style={{ flex: 1, gap: 7 }}>
            <Bar width="80%" height={14} />
            <Bar width="55%" height={11} />
          </View>
          {action ? <Bar width={64} height={32} radius={3} /> : null}
        </View>
      </View>
    </Card>
  );
}

/** A card of text lines — a details or summary card. */
export function SkeletonCard({
  lines = 3,
  variant = "filled",
}: {
  lines?: number;
  variant?: "filled" | "outline";
}) {
  const widths: `${number}%`[] = ["100%", "80%", "65%", "72%", "50%"];
  return (
    <Card variant={variant} style={{ gap: 10 }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Bar key={i} width={widths[i % widths.length]} height={13} />
      ))}
    </Card>
  );
}

/** The three-number training card (`Stat` is a 22px numeral over an eyebrow). */
export function SkeletonStatsCard() {
  return (
    <Card style={{ gap: 16 }}>
      <View style={{ flexDirection: "row", gap: 12 }}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={{ flex: 1, gap: 4 }}>
            <Bar width={38} height={22} />
            <Bar width={62} height={11} />
          </View>
        ))}
      </View>
      <View style={{ gap: 6 }}>
        <Bar width="55%" height={13} />
        <Bar width="42%" height={13} />
      </View>
    </Card>
  );
}

/** A labelled field — the eyebrow over its value (class detail, settings). */
export function SkeletonField({ width = 140 }: { width?: number }) {
  return (
    <View style={{ gap: 6 }}>
      <Bar width={60} height={11} />
      <Bar width={width} height={16} />
    </View>
  );
}

/** A notification: the unread dot, the title, the time, the body, the kind. */
export function SkeletonFeedRow() {
  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Bar width={6} height={6} radius={3} />
        <Bar width="60%" height={15} />
        <View style={{ flex: 1 }} />
        <Bar width={32} height={11} />
      </View>
      <View style={{ marginTop: 8, gap: 6 }}>
        <Bar width="100%" height={13} />
        <Bar width="70%" height={13} />
      </View>
      <View style={{ marginTop: 10 }}>
        <Bar width={78} height={11} />
      </View>
    </Card>
  );
}

/* ------------------------------------------------------- the screens, whole */

/** The rolling week (S4): days of classes, each with its rule. */
export function ScheduleSkeleton({ days = 3 }: { days?: number }) {
  return (
    <Frame>
      {Array.from({ length: days }).map((_, d) => (
        <View key={d} style={{ gap: 10 }}>
          <SkeletonDayRule />
          <SkeletonClassRow />
          <SkeletonClassRow />
        </View>
      ))}
    </Frame>
  );
}

/** My classes (S6): the next class, the stats card, then upcoming and past. */
export function MyClassesSkeleton() {
  return (
    <Frame gap={24}>
      <View style={{ gap: 12 }}>
        <Bar width={72} height={11} />
        <SkeletonCard lines={2} variant="outline" />
      </View>
      <View style={{ gap: 12 }}>
        <Bar width={80} height={11} />
        <SkeletonStatsCard />
      </View>
      <View style={{ gap: 8 }}>
        <Bar width={68} height={11} />
        <SkeletonClassRow />
        <SkeletonClassRow />
      </View>
    </Frame>
  );
}

/** The notification center (S13): days of messages. */
export function NotificationsSkeleton({ days = 2 }: { days?: number }) {
  return (
    <Frame>
      {Array.from({ length: days }).map((_, d) => (
        <View key={d} style={{ gap: 10 }}>
          <SkeletonDayRule meta={false} />
          <SkeletonFeedRow />
          <SkeletonFeedRow />
        </View>
      ))}
    </Frame>
  );
}

/** Class detail (S5): the title, then day / time / instructor / capacity. */
export function ClassDetailSkeleton() {
  return (
    <Frame gap={24}>
      <View style={{ gap: 8 }}>
        <Bar width="70%" height={24} />
        <Bar width={56} height={11} />
      </View>
      <View style={{ gap: 20 }}>
        <SkeletonField width={160} />
        <SkeletonField width={130} />
        <SkeletonField width={110} />
        <SkeletonField width={90} />
        <SkeletonField width={180} />
      </View>
    </Frame>
  );
}

/** Membership dues (S9): what you owe, the bank details, the pay button. */
export function DuesSkeleton() {
  return (
    <Card variant="outline" style={{ gap: 16 }}>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Loading"
        style={{ gap: 6 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Bar width={96} height={18} />
          <Bar width={56} height={20} radius={10} />
        </View>
        <Bar width="65%" height={13} />
      </View>
      <View style={{ gap: 12 }}>
        <SkeletonField width={200} />
        <SkeletonField width={140} />
      </View>
      <Bar width="100%" height={44} />
    </Card>
  );
}

/** My rank (S7): a line per discipline, then the promotion timeline. */
export function RankSkeleton() {
  return (
    <Card variant="outline" style={{ gap: 12 }}>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Loading"
        style={{ gap: 12 }}
      >
        {[0, 1].map((i) => (
          <View
            key={i}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <Bar width={72} height={14} />
            <Bar width={104} height={14} />
          </View>
        ))}
      </View>
    </Card>
  );
}

/** The walk-in check-in list: which class are you here for. */
export function CheckinSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <Frame gap={16}>
      {Array.from({ length: rows }).map((_, i) => (
        <Card key={i} variant="outline" style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Bar width={52} height={16} />
            <Bar width="55%" height={16} />
          </View>
          <Bar width="100%" height={44} />
        </Card>
      ))}
    </Frame>
  );
}
