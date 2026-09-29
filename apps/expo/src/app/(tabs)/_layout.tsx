import { StyleSheet, View } from "react-native";
import { Tabs } from "expo-router";

import { sans } from "~/components/fonts";
import { useTheme } from "~/components/ui";

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.foreground,
        tabBarInactiveTintColor: t.mutedForeground,
        tabBarStyle: {
          backgroundColor: t.background,
          borderTopColor: t.border,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
        tabBarLabelStyle: { fontSize: 12, fontFamily: sans(500) },
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
        borderWidth: 1.5,
        borderColor: color,
      }}
    >
      <View
        style={{
          position: "absolute",
          top: 3.5,
          left: 1,
          right: 1,
          height: 1.5,
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
