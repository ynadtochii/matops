import { useState } from "react";
import { Pressable, Switch, Text, useColorScheme, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button, Heading, Loading, Screen } from "~/components/ui";
import { trpc } from "~/utils/api";
import { authClient } from "~/utils/auth";
import {
  forgetPushToken,
  getPushToken,
  pushEnabled,
  rememberPushToken,
  setPushEnabled,
  storedPushToken,
} from "~/utils/push";

/**
 * Notification setting (spec S7) — the thin version: one switch that registers
 * or drops this device's push token, so "off" means nothing is sent. No server
 * preference needed. Class reminders and cancellations both ride push.
 */
function NotificationToggle() {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  const [on, setOn] = useState(pushEnabled());
  const register = useMutation(trpc.pushToken.register.mutationOptions());
  const unregister = useMutation(trpc.pushToken.unregister.mutationOptions());

  const toggle = (next: boolean) => {
    setOn(next);
    void setPushEnabled(next);
    if (next) {
      void getPushToken().then((reg) => {
        if (reg) {
          register.mutate(reg, {
            onSuccess: () => void rememberPushToken(reg.token),
          });
        }
      });
    } else {
      const token = storedPushToken();
      if (token) {
        unregister.mutate({ token });
        void forgetPushToken();
      }
    }
  };

  return (
    <View className="flex-row items-center justify-between gap-4">
      <View className="flex-1">
        <Text className="text-foreground text-base">Push notifications</Text>
        <Text className="text-muted-foreground text-sm">
          Class reminders and cancellations.
        </Text>
      </View>
      <Switch
        value={on}
        onValueChange={toggle}
        trackColor={{
          true: scheme === "dark" ? "#fafaf9" : "#1c1917",
          false: "#d6d3d1",
        }}
        thumbColor="#ffffff"
      />
    </View>
  );
}

/** One labelled fact row. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <View className="gap-1">
      <Text className="text-muted-foreground text-xs font-semibold uppercase">
        {label}
      </Text>
      <Text className="text-foreground text-base">{value}</Text>
    </View>
  );
}

/**
 * Profile / account (spec S7) — name, phone, current academy, and sign out. The
 * academy switcher appears only when the student trains at 2+ gyms; switching
 * changes the active academy and every scoped query follows via RLS. Notification
 * settings are Phase 4. This is the mobile student lens (docs/issues/18) — it
 * lists academies where the user is a student, not the ones they run.
 */
export default function Profile() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const current = useQuery(trpc.academy.current.queryOptions());
  const academies = useQuery(trpc.academy.listMineStudent.queryOptions());

  const setActive = useMutation(
    trpc.academy.setActive.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(),
    }),
  );

  const unregisterPush = useMutation(
    trpc.pushToken.unregister.mutationOptions(),
  );

  const signOut = () => {
    // Stop pushes to this device before the session cookie is gone (Phase 4).
    const token = storedPushToken();
    if (token) {
      unregisterPush.mutate({ token });
      void forgetPushToken();
    }
    void authClient.signOut();
    // The gate (index) sends signed-out users to sign in.
    router.replace("/");
  };

  if (!session) {
    return <Loading />;
  }

  const user = session.user;
  const phone =
    typeof user.phone === "string" && user.phone.length > 0 ? user.phone : "—";
  const list = academies.data ?? [];
  const activeId = current.data?.academyId;

  return (
    <Screen className="gap-6">
      <Stack.Screen options={{ title: "Profile" }} />

      <Heading>{user.name || user.email}</Heading>

      <View className="gap-5">
        <Field label="Name" value={user.name || "—"} />
        <Field label="Phone" value={phone} />
        <Field label="Email" value={user.email} />
        <Field label="Current academy" value={current.data?.name ?? "—"} />
      </View>

      {list.length >= 2 && (
        <View className="gap-2">
          <Text className="text-muted-foreground text-xs font-semibold uppercase">
            Switch academy
          </Text>
          {list.map((a) => {
            const isActive = a.academyId === activeId;
            return (
              <Pressable
                key={a.academyId}
                disabled={isActive || setActive.isPending}
                onPress={() => setActive.mutate({ academyId: a.academyId })}
                className={`flex-row items-center justify-between rounded-lg p-4 ${
                  isActive ? "bg-primary" : "bg-muted"
                }`}
              >
                <Text
                  className={
                    isActive
                      ? "text-primary-foreground text-base font-medium"
                      : "text-foreground text-base"
                  }
                >
                  {a.name}
                </Text>
                {isActive && (
                  <Text className="text-primary-foreground text-base">✓</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      )}

      <View className="gap-2">
        <Text className="text-muted-foreground text-xs font-semibold uppercase">
          Notifications
        </Text>
        <NotificationToggle />
      </View>

      <Button label="Sign out" variant="outline" onPress={signOut} />
    </Screen>
  );
}
