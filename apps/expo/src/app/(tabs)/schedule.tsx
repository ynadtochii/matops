import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import type { RouterOutputs } from "~/utils/api";
import {
  Banner,
  EmptyState,
  ErrorState,
  Heading,
  Loading,
  Mark,
  Screen,
  useTheme,
} from "~/components/ui";
import { trpc } from "~/utils/api";
import { dayFmt, dayKey, spotsLeftLabel, timeFmt } from "~/utils/format";

type ClassRow = RouterOutputs["class"]["mine"][number];

/** Local midnight today — the start of the rolling week window. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** One class row (spec S4: time · title · N spots left; a Booked pill if booked). */
function ClassCard({ c, onPress }: { c: ClassRow; onPress: () => void }) {
  const t = useTheme();
  const cancelled = c.status === "cancelled";
  const booked = c.myBooking === "booked";
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        backgroundColor: t.muted,
        borderRadius: 8,
        padding: 16,
      }}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ fontSize: 16, fontWeight: "500", color: t.foreground }}>
          {timeFmt.format(new Date(c.startsAt))} · {c.title}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {c.discipline && (
            <Text
              style={{ fontSize: 12, textTransform: "uppercase", color: t.mutedForeground }}
            >
              {c.discipline}
            </Text>
          )}
          {cancelled ? (
            <Text
              style={{ fontSize: 12, textTransform: "uppercase", color: t.destructive }}
            >
              Cancelled
            </Text>
          ) : (
            <Text style={{ fontSize: 14, color: t.mutedForeground }}>
              {spotsLeftLabel(c.capacity, c.bookingCount)}
            </Text>
          )}
          {booked && !cancelled && (
            <View
              style={{
                backgroundColor: t.brandWash,
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 4,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "500", color: t.brandStrong }}>
                Booked
              </Text>
            </View>
          )}
        </View>
      </View>
      <Text style={{ fontSize: 18, color: t.mutedForeground }}>›</Text>
    </Pressable>
  );
}

/**
 * Schedule home (spec S4) — the student's rolling week, grouped by day (Today
 * first). A pending member browses here behind the S3 banner (no waiting wall).
 * Tapping a class opens the detail (S5) where booking happens; a booked class
 * shows a violet "Booked" pill here.
 */
export default function Schedule() {
  const t = useTheme();
  const router = useRouter();
  const current = useQuery(trpc.academy.current.queryOptions());

  const { from, to } = useMemo(() => {
    const start = startOfToday();
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { from: start.toISOString(), to: end.toISOString() };
  }, []);

  const week = useQuery(trpc.class.mine.queryOptions({ from, to }));

  const todayKey = dayKey(new Date());
  const byDay = useMemo(() => {
    const groups = new Map<string, ClassRow[]>();
    for (const c of week.data ?? []) {
      const key = dayKey(new Date(c.startsAt));
      const list = groups.get(key) ?? [];
      list.push(c);
      groups.set(key, list);
    }
    return [...groups.entries()];
  }, [week.data]);

  const isPending = current.data?.status === "pending";

  return (
    <Screen>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <Heading>{current.data?.name ?? "Schedule"}</Heading>
        <Mark size={26} />
      </View>

      {isPending && (
        <View style={{ marginBottom: 16 }}>
          <Banner tone="brand">
            Pending approval — you can browse and book; your gym will confirm you
            soon.
          </Banner>
        </View>
      )}

      {week.isPending ? (
        <Loading />
      ) : week.isError ? (
        <ErrorState label="your schedule" onRetry={() => void week.refetch()} />
      ) : byDay.length === 0 ? (
        <EmptyState
          title="No classes this week."
          body="Check back soon — your gym adds classes here as they schedule them."
        />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: 20, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {byDay.map(([key, rows]) => (
            <View key={key} style={{ gap: 8 }}>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  textTransform: "uppercase",
                  color: t.mutedForeground,
                }}
              >
                {key === todayKey
                  ? "Today"
                  : dayFmt.format(new Date(`${key}T12:00:00`))}
              </Text>
              {rows.map((c) => (
                <ClassCard
                  key={c.id}
                  c={c}
                  onPress={() =>
                    router.push({
                      pathname: "/class/[id]",
                      params: { id: c.id },
                    })
                  }
                />
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}
