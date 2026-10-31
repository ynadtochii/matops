import { Pressable } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react-native";

import { Txt, useTheme } from "~/components/ui";
import { trpc } from "~/utils/api";

export function OverdueBanner() {
  const t = useTheme();
  const router = useRouter();
  const current = useQuery(trpc.academy.current.queryOptions());
  const enabled =
    current.data?.status === "active" && current.data.membershipEnforced;
  const memberships = useQuery(
    trpc.accessPlan.mine.queryOptions(undefined, { enabled }),
  );

  const banner = memberships.data?.bannerText;
  if (!banner) return null;
  const tone = banner.blocking ? t.error : t.warning;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push("/membership")}
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
        borderColor: `${tone}4d`,
        backgroundColor: `${tone}14`,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Txt size={13} weight={500} tone="secondary" style={{ flex: 1 }}>
        {banner.text}
      </Txt>
      {banner.action ? (
        <Txt size={13} weight={600}>
          {banner.action}
        </Txt>
      ) : null}
      <ChevronRight size={16} color={t.foreground} />
    </Pressable>
  );
}
