import type { ViewStyle } from "react-native";
import { View } from "react-native";
import { Tabs } from "expo-router";

import { sans } from "~/components/fonts";
import { useTheme } from "~/components/ui";

/**
 * The student tab bar (mobile structure, ticket 05). Four tabs: Schedule (S4,
 * home) → My classes (S6) → Scan (S8, ADR 70) → Profile (S7). Class detail (S5),
 * Settings (S12), the walk-in `checkin/[academyId]` screen, and the pre-join
 * stack push over the tabs from the root Stack. Screens own their own headings
 * (like the web), so the tab header is hidden. Icons are simple monochrome View
 * shapes, no icon-font dep.
 */
export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.brandStrong,
        tabBarInactiveTintColor: t.mutedForeground,
        tabBarStyle: {
          backgroundColor: t.background,
          borderTopColor: t.border,
        },
        tabBarLabelStyle: { fontSize: 11, fontFamily: sans(600) },
      }}
    >
      <Tabs.Screen
        name="schedule"
        options={{
          title: "Schedule",
          tabBarIcon: ({ color }) => <ScheduleIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="training"
        options={{
          title: "My classes",
          tabBarIcon: ({ color }) => <TrainingIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: "Scan",
          tabBarIcon: ({ color }) => <ScanIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => <ProfileIcon color={color} />,
        }}
      />
    </Tabs>
  );
}

function ScheduleIcon({ color }: { color: string }) {
  return (
    <View
      style={{
        width: 18,
        height: 18,
        borderRadius: 4,
        borderWidth: 1.8,
        borderColor: color,
      }}
    >
      <View
        style={{
          position: "absolute",
          top: 3.5,
          left: 1,
          right: 1,
          height: 1.6,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

function TrainingIcon({ color }: { color: string }) {
  // A simple bar-chart glyph — three rising bars for "your training".
  return (
    <View
      style={{
        width: 18,
        height: 18,
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
      }}
    >
      <View
        style={{ width: 4, height: 8, borderRadius: 1, backgroundColor: color }}
      />
      <View
        style={{
          width: 4,
          height: 13,
          borderRadius: 1,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          width: 4,
          height: 18,
          borderRadius: 1,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

function ScanIcon({ color }: { color: string }) {
  const corner: ViewStyle = {
    position: "absolute",
    width: 6,
    height: 6,
    borderColor: color,
  };
  return (
    <View style={{ width: 18, height: 18 }}>
      <View
        style={[
          corner,
          {
            top: 0,
            left: 0,
            borderTopWidth: 1.8,
            borderLeftWidth: 1.8,
            borderTopLeftRadius: 2,
          },
        ]}
      />
      <View
        style={[
          corner,
          {
            top: 0,
            right: 0,
            borderTopWidth: 1.8,
            borderRightWidth: 1.8,
            borderTopRightRadius: 2,
          },
        ]}
      />
      <View
        style={[
          corner,
          {
            bottom: 0,
            left: 0,
            borderBottomWidth: 1.8,
            borderLeftWidth: 1.8,
            borderBottomLeftRadius: 2,
          },
        ]}
      />
      <View
        style={[
          corner,
          {
            bottom: 0,
            right: 0,
            borderBottomWidth: 1.8,
            borderRightWidth: 1.8,
            borderBottomRightRadius: 2,
          },
        ]}
      />
      <View
        style={{
          position: "absolute",
          top: 8.2,
          left: 1,
          right: 1,
          height: 1.6,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

function ProfileIcon({ color }: { color: string }) {
  return (
    <View style={{ width: 18, height: 18, alignItems: "center" }}>
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: 4,
          backgroundColor: color,
          marginTop: 1,
        }}
      />
      <View
        style={{
          width: 14,
          height: 8,
          borderTopLeftRadius: 7,
          borderTopRightRadius: 7,
          backgroundColor: color,
          marginTop: 1.5,
        }}
      />
    </View>
  );
}
