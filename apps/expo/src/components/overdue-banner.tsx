import { Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { Txt, useTheme } from "~/components/ui";
import { trpc } from "~/utils/api";

export function OverdueBanner() {
  const t = useTheme();
  const router = useRouter();
  const current = useQuery(trpc.academy.current.queryOptions());
  const approved = current.data?.status === "active";
  const memberships = useQuery(
    trpc.accessPlan.mine.queryOptions(undefined, { enabled: approved }),
  );

  const warning = memberships.data?.memberships.find(
    (membership) => membership.warning,
  )?.warning;
  const strip = warning?.detail;
  if (!strip) return null;

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
        {strip}
      </Txt>
      <Txt size={16} tone="error">
        ›
      </Txt>
    </Pressable>
  );
}
