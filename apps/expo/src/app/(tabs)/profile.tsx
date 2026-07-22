import { useState } from "react";
import { Pressable, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Button,
  Heading,
  Loading,
  Screen,
  Stack,
  useTheme,
} from "~/components/ui";
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
  const t = useTheme();
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
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 16, color: t.foreground }}>
          Push notifications
        </Text>
        <Text style={{ fontSize: 14, color: t.mutedForeground }}>
          Class reminders and cancellations.
        </Text>
      </View>
      <Switch
        value={on}
        onValueChange={toggle}
        trackColor={{ true: t.brand, false: "#d6d3d1" }}
        thumbColor="#ffffff"
      />
    </View>
  );
}

/** One labelled fact row. */
function Field({ label, value }: { label: string; value: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text
        style={{
          fontSize: 12,
          fontWeight: "600",
          textTransform: "uppercase",
          color: t.mutedForeground,
        }}
      >
        {label}
      </Text>
      <Text style={{ fontSize: 16, color: t.foreground }}>{value}</Text>
    </View>
  );
}

/** A small section label above a group. */
function SectionLabel({ children }: { children: string }) {
  const t = useTheme();
  return (
    <Text
      style={{
        fontSize: 12,
        fontWeight: "600",
        textTransform: "uppercase",
        color: t.mutedForeground,
      }}
    >
      {children}
    </Text>
  );
}

/**
 * Profile / account (spec S7) — name, phone, current academy, switcher, and sign
 * out. The switcher appears only when the student trains at 2+ gyms. This is the
 * mobile student lens (docs/issues/18) — academies where the user is a student.
 */
export default function Profile() {
  const t = useTheme();
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
    <Screen>
      <Stack gap={24}>
        <Heading>{user.name || user.email}</Heading>

        <Stack gap={20}>
          <Field label="Name" value={user.name || "—"} />
          <Field label="Phone" value={phone} />
          <Field label="Email" value={user.email} />
          <Field label="Current academy" value={current.data?.name ?? "—"} />
        </Stack>

        {list.length >= 2 && (
          <Stack gap={8}>
            <SectionLabel>Switch academy</SectionLabel>
            {list.map((a) => {
              const isActive = a.academyId === activeId;
              return (
                <Pressable
                  key={a.academyId}
                  disabled={isActive || setActive.isPending}
                  onPress={() => setActive.mutate({ academyId: a.academyId })}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    borderRadius: 8,
                    padding: 16,
                    backgroundColor: isActive ? t.brand : t.muted,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 16,
                      fontWeight: isActive ? "500" : "400",
                      color: isActive ? t.brandForeground : t.foreground,
                    }}
                  >
                    {a.name}
                  </Text>
                  {isActive && (
                    <Text style={{ fontSize: 16, color: t.brandForeground }}>
                      ✓
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </Stack>
        )}

        <Stack gap={8}>
          <SectionLabel>Notifications</SectionLabel>
          <NotificationToggle />
        </Stack>

        <Button label="Sign out" variant="outline" onPress={signOut} />
      </Stack>
    </Screen>
  );
}
