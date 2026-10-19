import { useState } from "react";
import { Alert, Pressable, Switch, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useMutation } from "@tanstack/react-query";

import type { ThemeMode } from "~/components/theme";
import { useThemeMode } from "~/components/theme";
import {
  Button,
  confirm,
  Eyebrow,
  Heading,
  Screen,
  Txt,
  Stack as UIStack,
  useTheme,
} from "~/components/ui";
import { queryClient, trpc } from "~/utils/api";
import { authClient } from "~/utils/auth";
import { clearActiveEntity } from "~/utils/entity-store";
import {
  forgetPushToken,
  getPushToken,
  pushEnabled,
  rememberPushToken,
  setPushEnabled,
  storedPushToken,
} from "~/utils/push";
import { clearClassReminders } from "~/utils/reminders";

/**
 * Notification setting (spec S12) — one switch that registers or drops this
 * device's push token, so "off" means nothing is sent. No server preference.
 */
function NotificationToggle() {
  const t = useTheme();
  const [on, setOn] = useState(pushEnabled());
  const register = useMutation(trpc.pushToken.register.mutationOptions());
  const unregister = useMutation(trpc.pushToken.unregister.mutationOptions());

  // Turning the switch back off after a failure, so the UI never claims push is
  // on while nothing is actually registered.
  const revert = (message: string) => {
    setOn(false);
    void setPushEnabled(false);
    Alert.alert("Notifications off", message);
  };

  const toggle = (next: boolean) => {
    setOn(next);
    void setPushEnabled(next);
    if (next) {
      void getPushToken().then((reg) => {
        if (!reg) {
          // Permission denied or no device token — don't leave the switch "on".
          revert(
            "Couldn't turn on notifications. Check that notifications are allowed for MatOps in your phone's Settings.",
          );
          return;
        }
        register.mutate(reg, {
          onSuccess: () => void rememberPushToken(reg.token),
          onError: () =>
            revert("Couldn't register this device. Try again in a moment."),
        });
      });
    } else {
      void clearClassReminders();
      const token = storedPushToken();
      if (token) {
        unregister.mutate({ token });
        void forgetPushToken();
      }
    }
  };

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <View style={{ flex: 1 }}>
        <Txt size={15}>Push notifications</Txt>
        <Txt size={13} tone="muted">
          Class reminders and cancellations.
        </Txt>
      </View>
      <Switch
        accessibilityLabel="Push notifications"
        value={on}
        onValueChange={toggle}
        trackColor={{ true: t.primary, false: t.track }}
        thumbColor="#ffffff"
      />
    </View>
  );
}

/** Light / Dark / System selector (mirrors the web ThemeToggle). */
function AppearanceControl() {
  const t = useTheme();
  const { mode, setMode } = useThemeMode();
  const options: { key: ThemeMode; label: string }[] = [
    { key: "dark", label: "Dark" },
    { key: "light", label: "Light" },
    { key: "auto", label: "System" },
  ];
  return (
    <View
      style={{
        flexDirection: "row",
        padding: 2,
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: 5,
        backgroundColor: t.surface1,
      }}
    >
      {options.map((o) => {
        const active = mode === o.key;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="button"
            accessibilityLabel={`${o.label} appearance`}
            accessibilityState={{ selected: active }}
            onPress={() => setMode(o.key)}
            style={{
              flex: 1,
              minHeight: 40,
              borderRadius: 4,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: active ? t.active : "transparent",
            }}
          >
            <Txt size={15} weight={500} tone={active ? "default" : "muted"}>
              {o.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Settings (spec S12, v1.8 slice 5) — appearance, push notifications, and sign
 * out, split out of Profile (S7) so Profile holds only identity + membership.
 * Reached via the gear in the Profile header; a pushed screen, not a tab.
 */
export default function Settings() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const unregisterPush = useMutation(
    trpc.pushToken.unregister.mutationOptions(),
  );

  const doSignOut = async () => {
    setSigningOut(true);
    void clearClassReminders();
    const token = storedPushToken();
    if (token) {
      unregisterPush.mutate({ token });
      void forgetPushToken();
    }
    try {
      await authClient.signOut();
    } finally {
      // Query keys carry no user id, so anything left cached would be served to
      // the next person who signs in on this device. The stored academy goes
      // with them: it would otherwise name a gym the next person cannot open.
      await clearActiveEntity();
      queryClient.clear();
      router.replace("/");
    }
  };

  const confirmSignOut = () =>
    confirm({
      title: "Sign out?",
      message: "You'll need your email sign-in link to get back in.",
      confirmLabel: "Sign out",
      onConfirm: () => void doSignOut(),
    });

  return (
    <Screen>
      <Stack.Screen options={{ title: "Settings" }} />
      <UIStack gap={24}>
        <Heading>Settings</Heading>

        <UIStack gap={8}>
          <Eyebrow>Appearance</Eyebrow>
          <AppearanceControl />
        </UIStack>

        <UIStack gap={8}>
          <Eyebrow>Notifications</Eyebrow>
          <NotificationToggle />
        </UIStack>

        <Button
          label={signingOut ? "Signing out…" : "Sign out"}
          variant="outline"
          loading={signingOut}
          onPress={confirmSignOut}
        />
      </UIStack>
    </Screen>
  );
}
