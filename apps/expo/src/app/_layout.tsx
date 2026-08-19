import { useEffect } from "react";
import { AppState } from "react-native";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { focusManager, QueryClientProvider } from "@tanstack/react-query";

import { fontAssets, sans } from "~/components/fonts";
import { PushSync } from "~/components/push-sync";
import { ThemeProvider, useThemeMode } from "~/components/theme";
import { ToastProvider } from "~/components/toast";
import { queryClient } from "~/utils/api";

import "../styles.css";

void SplashScreen.preventAutoHideAsync();

/**
 * The navigation chrome — a neutral Stack whose header follows the resolved
 * (dark-first) palette and Geist. Lives inside the ThemeProvider so it can read
 * the active theme; the tab group owns its own chrome (screens render headings).
 */
function Chrome() {
  const { resolved, theme } = useThemeMode();
  return (
    <>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.foreground,
          headerBackTitle: "Back",
          headerTitleStyle: { fontFamily: sans(600) },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style={resolved === "dark" ? "light" : "dark"} />
    </>
  );
}

/**
 * Root layout — loads Geist / Geist Mono (holding the splash until ready), then
 * wraps every screen in the tRPC/React Query provider and the dark-first theme.
 */
export default function RootLayout() {
  const [fontsLoaded] = useFonts(fontAssets);

  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (status) =>
      focusManager.setFocused(status === "active"),
    );
    return () => sub.remove();
  }, []);

  if (!fontsLoaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <PushSync />
          <Chrome />
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
