import type { ViewStyle } from "react-native";
import { View } from "react-native";

/**
 * The web shell's header glyphs, redrawn with positioned Views. Same shapes as
 * `apps/nextjs/src/app/_components/app-shell.tsx`, same 1.5/16 stroke weight,
 * so a student moving between the two clients sees one icon set. Views rather
 * than SVG for the same reason the tab icons are Views: no icon dependency.
 */

/** The notification bell — dome, rim, clapper. */
export function BellIcon({
  color,
  size = 20,
}: {
  color: string;
  size?: number;
}) {
  const s = size / 16;
  const stroke = Math.max(1, 1.5 * s);
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          position: "absolute",
          left: 3 * s,
          top: 2 * s,
          width: 10 * s,
          height: 8 * s,
          borderWidth: stroke,
          borderBottomWidth: 0,
          borderColor: color,
          borderTopLeftRadius: 5 * s,
          borderTopRightRadius: 5 * s,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: 2 * s,
          top: 10 * s - stroke,
          width: 12 * s,
          height: stroke,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: "absolute",
          left: 6.2 * s,
          top: 11 * s,
          width: 3.6 * s,
          height: 2.4 * s,
          borderWidth: stroke,
          borderTopWidth: 0,
          borderColor: color,
          borderBottomLeftRadius: 2 * s,
          borderBottomRightRadius: 2 * s,
        }}
      />
    </View>
  );
}

/** Settings — two sliders, the web `SettingsIcon`, not a gear. */
export function SettingsIcon({
  color,
  size = 20,
}: {
  color: string;
  size?: number;
}) {
  const s = size / 16;
  const stroke = Math.max(1, 1.5 * s);
  const rail = (left: number, right: number, top: number): ViewStyle => ({
    position: "absolute",
    left: left * s,
    top: top * s - stroke / 2,
    width: (right - left) * s,
    height: stroke,
    backgroundColor: color,
  });
  const knob = (left: number, top: number): ViewStyle => ({
    position: "absolute",
    left: (left - 1.7) * s,
    top: (top - 1.7) * s,
    width: 3.4 * s,
    height: 3.4 * s,
    borderRadius: 1.7 * s,
    borderWidth: stroke,
    borderColor: color,
  });
  return (
    <View style={{ width: size, height: size }}>
      <View style={rail(2, 4.3, 5)} />
      <View style={rail(7.7, 14, 5)} />
      <View style={rail(2, 8.3, 11)} />
      <View style={rail(11.7, 14, 11)} />
      <View style={knob(6, 5)} />
      <View style={knob(10, 11)} />
    </View>
  );
}
