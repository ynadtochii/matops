import type { ReactNode } from "react";
import { View } from "react-native";
import { useQuery } from "@tanstack/react-query";

import { NotificationBell } from "~/components/notification-bell";
import { Mark, Txt, useTheme } from "~/components/ui";
import { trpc } from "~/utils/api";

/**
 * The tab-screen top bar, the twin of the web shell's mobile header (ADR 73):
 * the mark, the academy you are in, then the icons. Full-bleed on the `--card`
 * surface with a hairline under it, so it reads as chrome and the screen title
 * below it reads as the page. Sign out and appearance are not here as they are
 * on the web: on the phone they live in Settings (S12).
 */
export function AppHeader({ right }: { right?: ReactNode }) {
  const t = useTheme();
  const current = useQuery(trpc.academy.current.queryOptions());
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 10,
        backgroundColor: t.card,
        borderBottomWidth: 1,
        borderBottomColor: t.border,
      }}
    >
      <Mark size={22} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt size={14} weight={500} numberOfLines={1}>
          {current.data?.name ?? "matops"}
        </Txt>
      </View>
      <NotificationBell />
      {right}
    </View>
  );
}
