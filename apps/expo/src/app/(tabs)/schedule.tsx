import { useMemo } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import type { RouterOutputs } from "~/utils/api";
import { BookButton } from "~/components/book-control";
import { OverdueBanner } from "~/components/overdue-banner";
import {
  Banner,
  Card,
  EmptyState,
  ErrorState,
  Eyebrow,
  Heading,
  InlineLoading,
  Mark,
  Mono,
  Screen,
  StatusPill,
  Txt,
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

/** A small violet pill marking the student's own booking (identity, not status). */
function BookedPill() {
  const t = useTheme();
  return (
    <View
      style={{
        backgroundColor: t.brandWash,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 999,
      }}
    >
      <Txt data size={11} weight={600} tone="brand" uppercase tracking={0.4}>
        Booked
      </Txt>
    </View>
  );
}

/**
 * One class row (spec S4: time · title · N spots left; a Booked pill if booked).
 * Since v1.8 (slice 1) a bookable row carries a compact inline **Book** button,
 * so booking is one tap here — the detail (S5) is no longer required to book.
 * Tapping the row still opens the detail for full info + Cancel.
 */
function ClassCard({
  c,
  onPress,
  now,
}: {
  c: ClassRow;
  onPress: () => void;
  now: Date;
}) {
  const cancelled = c.status === "cancelled";
  const booked = c.myBooking === "booked";
  const past = new Date(c.startsAt).getTime() <= now.getTime();
  const bookable = !cancelled && !booked && !past;
  return (
    <Card variant="filled" onPress={onPress}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flex: 1, gap: 6 }}>
          <Txt size={16} weight={500}>
            <Mono size={16} weight={600}>
              {timeFmt.format(new Date(c.startsAt))}
            </Mono>
            {`  ${c.title}`}
          </Txt>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {c.discipline ? <Eyebrow>{c.discipline}</Eyebrow> : null}
            {cancelled ? (
              <StatusPill tone="error" label="Cancelled" />
            ) : (
              <Mono size={13} tone="muted">
                {spotsLeftLabel(c.capacity, c.bookingCount)}
              </Mono>
            )}
            {booked && !cancelled ? <BookedPill /> : null}
          </View>
        </View>
        {bookable ? (
          <BookButton c={c} />
        ) : (
          <Txt size={18} tone="muted">
            ›
          </Txt>
        )}
      </View>
    </Card>
  );
}

/**
 * Schedule home (spec S4) — the student's rolling week, grouped by day (Today
 * first). A pending member browses here behind the S3 banner (no waiting wall).
 * Tapping a class opens the detail (S5) where booking happens.
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

  const now = new Date();
  const todayKey = dayKey(now);
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
      <OverdueBanner />

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
            Pending approval — you can browse and book; your gym will confirm
            you soon.
          </Banner>
        </View>
      )}

      {week.isPending ? (
        <InlineLoading />
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
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ gap: 20 }}>
            {byDay.map(([key, rows]) => (
              <View key={key} style={{ gap: 8 }}>
                <Eyebrow>
                  {key === todayKey
                    ? "Today"
                    : dayFmt.format(new Date(`${key}T12:00:00`))}
                </Eyebrow>
                {rows.map((c) => (
                  <ClassCard
                    key={c.id}
                    c={c}
                    now={now}
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
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}
