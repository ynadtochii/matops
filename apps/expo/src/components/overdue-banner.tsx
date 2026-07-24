import { Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { Txt, useTheme } from "~/components/ui";
import { trpc } from "~/utils/api";

/**
 * Overdue warning header (v1.8 slice 3, spec S11). A thin, non-dismissible strip
 * shown at the top of the main tab screens **only** while the member's dues are
 * overdue — the one urgent money state, promoted out of the bottom of Profile so
 * it finds the student instead of hiding.
 *
 * Status is derived server-side from `next_due_at` (ADR 40, never stored), so the
 * strip self-clears within one refetch after the owner confirms payment. It fails
 * quiet: while loading, on error, or for a paid / due-soon / not-yet-set-up member
 * it renders nothing. Tapping it lands on Profile → the pay section.
 *
 * Kept thin (reuses the dashed error accent, not a full block) so it never stacks
 * as a heavy second banner beside the S3 pending callout on Schedule.
 */
export function OverdueBanner() {
  const t = useTheme();
  const router = useRouter();
  // A suspended member has no enrolled access — `payments.myDues` is rejected.
  // Gate the query off so the strip stays quiet without a 403 on every screen.
  const current = useQuery(trpc.academy.current.queryOptions());
  const suspended = current.data?.status === "suspended";
  const dues = useQuery(
    trpc.payments.myDues.queryOptions(undefined, { enabled: !suspended }),
  );

  if (dues.data?.dues?.status !== "overdue") return null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() =>
        router.push({ pathname: "/profile", params: { focus: "dues" } })
      }
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 12,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 3,
        borderLeftWidth: 3,
        borderLeftColor: t.error,
        borderStyle: "dashed",
        backgroundColor: `${t.error}1a`,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Txt size={14} weight={500} style={{ flex: 1 }}>
        Membership payment overdue — tap to pay.
      </Txt>
      <Txt size={16} tone="error">
        ›
      </Txt>
    </Pressable>
  );
}
