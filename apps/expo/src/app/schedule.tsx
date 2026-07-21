import { useMemo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import type { RouterOutputs } from "~/utils/api";
import {
  Banner,
  EmptyState,
  ErrorState,
  Loading,
  Screen,
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

/** One class row in the schedule (spec S4: time · title · N spots left). */
function ClassCard({ c, onPress }: { c: ClassRow; onPress: () => void }) {
  const cancelled = c.status === "cancelled";
  const booked = c.myBooking === "booked";
  return (
    <Pressable
      onPress={onPress}
      className="bg-muted flex-row items-center justify-between gap-3 rounded-lg p-4"
    >
      <View className="flex-1 gap-1">
        <Text className="text-foreground text-base font-medium">
          {timeFmt.format(new Date(c.startsAt))} · {c.title}
        </Text>
        <View className="flex-row items-center gap-2">
          {c.discipline && (
            <Text className="text-muted-foreground text-xs uppercase">
              {c.discipline}
            </Text>
          )}
          {cancelled ? (
            <Text className="text-destructive text-xs uppercase">
              Cancelled
            </Text>
          ) : (
            <Text className="text-muted-foreground text-sm">
              {spotsLeftLabel(c.capacity, c.bookingCount)}
            </Text>
          )}
          {booked && !cancelled && (
            <Text className="bg-primary/10 text-primary rounded px-2 py-0.5 text-xs font-medium">
              Booked
            </Text>
          )}
        </View>
      </View>
      <Text className="text-muted-foreground text-lg">›</Text>
    </Pressable>
  );
}

/**
 * Schedule home (spec S4) — the student's rolling week of classes, grouped by
 * day (Today first). A pending member browses here behind the S3 banner (no
 * waiting wall). Tapping a class opens the detail (S5), where booking happens
 * (slice 3.1); a class the student has booked shows a "Booked" pill here.
 */
export default function Schedule() {
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
    <Screen className="gap-4">
      <Stack.Screen
        options={{
          title: "Schedule",
          headerLeft: () => (
            <Pressable onPress={() => router.push("/checkin")} hitSlop={8}>
              <Text className="text-primary text-base font-medium">
                Check in
              </Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable onPress={() => router.push("/profile")} hitSlop={8}>
              <Text className="text-primary text-base font-medium">
                Profile
              </Text>
            </Pressable>
          ),
        }}
      />

      {isPending && (
        <Banner tone="warning">
          Pending approval — you can browse and book; your gym will confirm you
          soon.
        </Banner>
      )}

      {week.isPending ? (
        <Loading />
      ) : week.isError ? (
        <ErrorState
          label="your schedule"
          onRetry={() => void week.refetch()}
        />
      ) : byDay.length === 0 ? (
        <EmptyState
          title="No classes this week."
          body="Check back soon — your gym adds classes here as they schedule them."
        />
      ) : (
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-5 pb-8"
          showsVerticalScrollIndicator={false}
        >
          {byDay.map(([key, rows]) => (
            <View key={key} className="gap-2">
              <Text className="text-muted-foreground text-xs font-semibold uppercase">
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
