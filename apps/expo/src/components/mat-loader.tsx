import { useEffect, useState, useSyncExternalStore } from "react";
import { AccessibilityInfo, Animated, Text, View } from "react-native";

import { sans } from "./fonts";
import { useTheme } from "./theme";

/**
 * The one loading moment that carries the brand: the basketweave mark laying
 * itself, the way a gym lays mats before class (ADR 80). The twin of the web
 * `_components/mat-loader.tsx`, drawn with the same positioned Views the `Mark`
 * in `ui.tsx` uses (no SVG dependency, ADR 44) and animated by scaling each
 * seam from the end it starts at.
 *
 * Use it only where there is no chrome yet and nothing to mirror: the auth
 * gate, the magic link, an invite opening. Once a screen is drawn, a skeleton
 * that matches it says more than a spinner, so `skeletons.tsx` takes over.
 *
 * Reduced motion: the mark stands still, fully woven, and the label carries the
 * "busy" meaning on its own.
 */
const CYCLE_MS = 1900;
const STAGGER = 90 / CYCLE_MS;
const DRAW = 0.34;
const FADE_OUT = 0.86;

interface Box {
  left?: number;
  top?: number;
  width: number;
  height: number;
}
interface Seam {
  vertical: boolean;
  box: (size: number, th: number) => Box;
}

/** The six planks, in the order the weave lays them: centre pair, then four. */
const SEAMS: Seam[] = [
  {
    vertical: true,
    box: (s, th) => ({ left: s / 2 - th / 2, top: 0, width: th, height: s }),
  },
  {
    vertical: false,
    box: (s, th) => ({ top: s / 2 - th / 2, left: 0, width: s, height: th }),
  },
  {
    vertical: true,
    box: (s, th) => ({
      left: s * 0.2656 - th / 2,
      top: 0,
      width: th,
      height: s / 2,
    }),
  },
  {
    vertical: false,
    box: (s, th) => ({
      top: s * 0.2656 - th / 2,
      left: s / 2,
      width: s / 2,
      height: th,
    }),
  },
  {
    vertical: false,
    box: (s, th) => ({
      top: s * 0.7344 - th / 2,
      left: 0,
      width: s / 2,
      height: th,
    }),
  },
  {
    vertical: true,
    box: (s, th) => ({
      left: s * 0.7344 - th / 2,
      top: s / 2,
      width: th,
      height: s / 2,
    }),
  },
];

/*
 * One "reduce motion" subscription for the whole app. Every skeleton bar reads
 * this, and a screen can hold thirty of them, so a listener per caller would be
 * thirty listeners and thirty async reads for one boolean.
 */
let reducedMotion = false;
const motionListeners = new Set<() => void>();

function setReducedMotion(on: boolean) {
  reducedMotion = on;
  for (const notify of motionListeners) notify();
}

void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);

/** The device's "reduce motion" switch, live. */
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      motionListeners.add(onChange);
      return () => {
        motionListeners.delete(onChange);
      };
    },
    () => reducedMotion,
  );
}

export function MatLoader({
  size = 56,
  label,
}: {
  size?: number;
  label?: string;
}) {
  const t = useTheme();
  const reduced = useReducedMotion();
  // Stable Animated.Values held as state (lazy init) — not refs, so they are
  // safe to read during render, the way `toast.tsx` holds its fade.
  const [weave] = useState(() => new Animated.Value(0));
  // `enter` is held at 0 for 180ms, so a wait that resolves faster shows nothing
  // at all. A loader that flashes for one frame is worse than no loader.
  const [enter] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const fade = Animated.timing(enter, {
      toValue: 1,
      duration: reduced ? 0 : 220,
      delay: reduced ? 0 : 180,
      useNativeDriver: true,
    });
    fade.start();
    if (reduced) return () => fade.stop();
    const loop = Animated.loop(
      Animated.timing(weave, {
        toValue: 1,
        duration: CYCLE_MS,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      fade.stop();
      loop.stop();
      weave.setValue(0);
    };
  }, [enter, weave, reduced]);

  const th = Math.max(1, size * 0.05);

  return (
    <Animated.View
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? "Loading"}
      style={{ alignItems: "center", gap: 16, opacity: enter }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.22,
          backgroundColor: t.brand,
          overflow: "hidden",
        }}
      >
        {SEAMS.map((seam, i) => {
          const from = i * STAGGER;
          const scale = reduced
            ? 1
            : weave.interpolate({
                inputRange: [from, from + DRAW],
                outputRange: [0, 1],
                extrapolate: "clamp",
              });
          const opacity = reduced
            ? 0.85
            : weave.interpolate({
                inputRange: [from, from + 0.05, FADE_OUT, 1],
                outputRange: [0, 0.85, 0.85, 0],
                extrapolate: "clamp",
              });
          return (
            <Animated.View
              key={i}
              style={{
                position: "absolute",
                backgroundColor: t.brandForeground,
                ...seam.box(size, th),
                opacity,
                transformOrigin: seam.vertical ? "top" : "left",
                transform: [
                  seam.vertical ? { scaleY: scale } : { scaleX: scale },
                ],
              }}
            />
          );
        })}
      </View>
      {label ? (
        <Text
          style={{
            fontFamily: sans(500),
            fontSize: 13,
            color: t.mutedForeground,
          }}
        >
          {label}
        </Text>
      ) : null}
    </Animated.View>
  );
}
