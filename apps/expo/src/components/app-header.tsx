import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { AcademyIcon, Avatar } from "~/components/avatar";
import { NotificationBell } from "~/components/notification-bell";
import { IconButton, Mark, Txt, useTheme } from "~/components/ui";
import { trpc } from "~/utils/api";
import { authClient } from "~/utils/auth";

export function AppHeader({ right }: { right?: ReactNode }) {
  const t = useTheme();
  const router = useRouter();
  const user = authClient.useSession().data?.user;
  const current = useQuery(trpc.academy.current.queryOptions());
  const name = current.data?.name ?? "MatOps";
  const iconUrl = current.data?.iconUrl ?? null;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingLeft: 16,
        paddingRight: 8,
        minHeight: 56,
        backgroundColor: t.card,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: t.border,
      }}
    >
      {iconUrl ? (
        <AcademyIcon src={iconUrl} name={name} size={24} />
      ) : (
        <Mark size={22} />
      )}
      <View style={{ flex: 1, minWidth: 0, marginLeft: 6 }}>
        <Txt size={15} weight={500} numberOfLines={1}>
          {name}
        </Txt>
      </View>
      <NotificationBell />
      {user && current.data ? (
        <IconButton label="Profile" onPress={() => router.navigate("/profile")}>
          <Avatar
            src={current.data.avatarUrl}
            name={user.name}
            email={user.email}
            size={28}
          />
        </IconButton>
      ) : null}
      {right}
    </View>
  );
}
