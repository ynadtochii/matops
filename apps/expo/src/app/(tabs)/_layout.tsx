import { View } from "react-native";
import { Tabs } from "expo-router";

import { useTheme } from "~/components/ui";

/**
 * The student tab bar (mobile structure, ticket 05). Three tabs cover the core
 * loop: Schedule (S4, home) → Check in (S8) → Profile (S7). Class detail (S5)
 * and the pre-join stack (sign-in, join) push over the tabs from the root Stack.
 * Screens own their own headings (like the web), so the tab header is hidden.
 * Icons are simple monochrome View shapes — no icon-font dependency.
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
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
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
        name="checkin"
        options={{
          title: "Check in",
          tabBarIcon: ({ color }) => <CheckinIcon color={color} />,
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
      style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 1.8, borderColor: color }}
    >
      <View style={{ position: "absolute", top: 3.5, left: 1, right: 1, height: 1.6, backgroundColor: color }} />
    </View>
  );
}

function CheckinIcon({ color }: { color: string }) {
  return (
    <View
      style={{
        width: 18,
        height: 18,
        borderRadius: 4,
        borderWidth: 1.8,
        borderColor: color,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
    </View>
  );
}

function ProfileIcon({ color }: { color: string }) {
  return (
    <View style={{ width: 18, height: 18, alignItems: "center" }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color, marginTop: 1 }} />
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
