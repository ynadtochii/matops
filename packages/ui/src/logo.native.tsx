/// <reference types="react-native-css/types" />
import { Text, useColorScheme, View } from "react-native";

import { cn } from "@matops/ui";
import { tokens } from "@matops/ui/tokens";

/**
 * matops mark (RN twin of ./logo.tsx) — the **basketweave** mat bond drawn with
 * positioned Views so mobile needs no `react-native-svg`. The tile + seams use
 * `bg-*` classes (background colours DO translate on NativeWind v5 and follow
 * the app theme; see ADR 36). The wordmark's *text* colour + row layout use
 * explicit RN styles + `@matops/ui/tokens` — NativeWind v5 does not reliably
 * translate foreground colours / `gap` / alignment on native (ADR 36). Text
 * colour follows the OS scheme until the mobile kit's theme hook wires it.
 * See docs/design.md §6, ADR 37.
 */
export function Mark({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const t = Math.max(1, size * 0.05); // seam thickness
  const half = size / 2;
  const seam = (style: object) => (
    <View
      className="bg-brand-foreground"
      style={{ position: "absolute", opacity: 0.85, ...style }}
    />
  );

  return (
    <View
      className={cn("bg-brand overflow-hidden", className)}
      style={{ width: size, height: size, borderRadius: size * 0.22 }}
    >
      {/* central cross */}
      {seam({ left: half - t / 2, top: 0, width: t, height: size })}
      {seam({ top: half - t / 2, left: 0, width: size, height: t })}
      {/* woven quadrant seams (basketweave) */}
      {seam({ left: size * 0.2656 - t / 2, top: 0, width: t, height: half })}
      {seam({ top: size * 0.2656 - t / 2, left: half, width: half, height: t })}
      {seam({ top: size * 0.7344 - t / 2, left: 0, width: half, height: t })}
      {seam({ left: size * 0.7344 - t / 2, top: half, width: t, height: half })}
    </View>
  );
}

/** Mark + `matops` wordmark lockup. "ops" carries the brand-strong accent. */
export function Logo({
  size = 24,
  withWordmark = true,
  className,
}: {
  size?: number;
  withWordmark?: boolean;
  className?: string;
}) {
  const c = tokens[useColorScheme() ?? "light"];
  return (
    <View
      className={className}
      style={{ flexDirection: "row", alignItems: "center" }}
    >
      <Mark size={size} />
      {withWordmark && (
        <Text
          style={{
            marginLeft: 8,
            fontSize: 18,
            fontWeight: "600",
            letterSpacing: -0.4,
            color: c.foreground,
          }}
        >
          mat<Text style={{ color: c.brandStrong }}>ops</Text>
        </Text>
      )}
    </View>
  );
}
