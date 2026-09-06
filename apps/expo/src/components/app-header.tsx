import type { ReactNode } from "react";
import { View } from "react-native";

import { BranchName } from "~/components/branch-switch";
import { NotificationBell } from "~/components/notification-bell";
import { Mark, useTheme } from "~/components/ui";

/**
 * The tab-screen top bar, the twin of the web shell's mobile header (ADR 73):
 * the mark, the academy you are in, then the icons. Full-bleed on the `--card`
 * surface with a hairline under it, so it reads as chrome and the screen title
 * below it reads as the page. Sign out and appearance are not here as they are
 * on the web: on the phone they live in Settings (S12).
 *
 * The branch name is the switcher (ADR 129): comparing two schedules is done
 * from the schedule, not from Profile.
 */
export function AppHeader({ right }: { right?: ReactNode }) {
  const t = useTheme();
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
        <BranchName />
      </View>
      <NotificationBell />
      {right}
    </View>
  );
}
