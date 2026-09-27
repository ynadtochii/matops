import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useQuery } from "@tanstack/react-query";

import { NotificationBell } from "~/components/notification-bell";
import { Mark, Txt, useTheme } from "~/components/ui";
import { trpc } from "~/utils/api";

export function AppHeader({ right }: { right?: ReactNode }) {
  const t = useTheme();
  const current = useQuery(trpc.academy.current.queryOptions());
  const name = current.data?.name ?? "MatOps";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: t.card,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: t.border,
      }}
    >
      <Mark size={22} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt size={15} weight={500} numberOfLines={1}>
          {name}
        </Txt>
      </View>
      <NotificationBell />
      {right}
    </View>
  );
}
