import { StyleSheet } from "react-native";
import { Tabs } from "expo-router";
import { CalendarCheck, CalendarDays, User } from "lucide-react-native";

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
          tabBarIcon: ({ color }) => <CalendarDays size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="training"
        options={{
          title: "My classes",
          tabBarIcon: ({ color }) => <CalendarCheck size={20} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color }) => <User size={20} color={color} />,
        }}
      />
    </Tabs>
  );
}
