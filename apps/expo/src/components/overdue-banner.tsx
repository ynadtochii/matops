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
        minHeight: 44,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: `${t.error}4d`,
        backgroundColor: `${t.error}14`,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Txt size={13} weight={500} tone="secondary" style={{ flex: 1 }}>
        {strip}
      </Txt>
      <Txt size={16} tone="error">
        ›
      </Txt>
    </Pressable>
  );
}
