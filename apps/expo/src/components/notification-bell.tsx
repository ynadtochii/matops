import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Bell } from "lucide-react-native";

import { useTheme } from "~/components/ui";
import { trpc } from "~/utils/api";

/**
 * The header bell (spec S13; ADR 77). Notifications get no tab of their own on
 * mobile. The feed is a pushed screen, reached from here, with a red dot while
 * anything is unread. Hidden until the membership is active, because the feed
 * procedures are member-only.
 */
export function NotificationBell() {
  const router = useRouter();
  const t = useTheme();
  const current = useQuery(trpc.academy.current.queryOptions());
  const active = current.data?.status === "active";
  const unread = useQuery(
    trpc.notification.unreadCount.queryOptions(undefined, { enabled: active }),
  );
  const count = unread.data ?? 0;

  if (!active) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        count > 0 ? `Notifications, ${count} unread` : "Notifications"
      }
      onPress={() => router.push("/notifications")}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 5,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: pressed ? t.hover : "transparent",
      })}
    >
      <Bell size={20} color={t.mutedForeground} />
      {count > 0 ? (
        <View
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            width: 9,
            height: 9,
            borderRadius: 5,
            backgroundColor: t.error,
            borderWidth: 1.5,
            borderColor: t.card,
          }}
        />
      ) : null}
    </Pressable>
  );
}
