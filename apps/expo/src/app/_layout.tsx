import { useColorScheme } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClientProvider } from "@tanstack/react-query";

import { PushSync } from "~/components/push-sync";
import { headerColors } from "~/components/ui";
import { queryClient } from "~/utils/api";

import "../styles.css";

/**
 * Root layout — wraps every screen in the tRPC/React Query provider and a
 * neutral Stack whose header follows the shared light/dark palette (the Stack
 * needs hex, not NativeWind classes).
 */
export default function RootLayout() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const c = headerColors[scheme];
  return (
    <QueryClientProvider client={queryClient}>
      <PushSync />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: c.bg },
          headerTintColor: c.tint,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: c.bg },
        }}
      />
      <StatusBar />
    </QueryClientProvider>
  );
}
