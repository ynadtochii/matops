import { useMemo, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { nextBookableClass } from "@matops/domain";

import type { RouterOutputs } from "~/utils/api";
import {
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Eyebrow,
  Heading,
  Loading,
  Mark,
  Mono,
  Screen,
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

/** One class row (spec S4: time · title · N spots left; a Booked pill if booked). */
function ClassCard({ c, onPress }: { c: ClassRow; onPress: () => void }) {
  const cancelled = c.status === "cancelled";
  const booked = c.myBooking === "booked";
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
              <Txt
                data
                size={11}
                weight={600}
                tone="error"
                uppercase
                tracking={0.4}
              >
                Cancelled
              </Txt>
            ) : (
              <Mono size={13} tone="muted">
                {spotsLeftLabel(c.capacity, c.bookingCount)}
              </Mono>
            )}
            {booked && !cancelled ? <BookedPill /> : null}
          </View>
        </View>
        <Txt size={18} tone="muted">
          ›
        </Txt>
      </View>
    </Card>
  );
}

/** "Today · 18:00" style label for the featured card. */
function whenLabel(startsAt: Date | string): string {
  const d = new Date(startsAt);
  const isToday = dayKey(d) === dayKey(new Date());
  return `${isToday ? "Today" : dayFmt.format(d)} · ${timeFmt.format(d)}`;
}

/**
 * The one-tap "Next class" card (v1.3, F.1 — spec S4). Features the class the
 * student would book next, with a single Book button and the soft-capacity
 * confirm — no search, no navigation. Reuses `booking.book` + the schedule data.
 */
function NextClassCard({ c }: { c: ClassRow }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const book = useMutation(
    trpc.booking.book.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries(trpc.class.pathFilter()),
      onError: (err) => setError(err.message || "Could not book"),
    }),
  );
  const booked = c.myBooking === "booked";
  const over = c.capacity > 0 && c.bookingCount >= c.capacity;
  const doBook = () => {
    setError(null);
    book.mutate({ classId: c.id });
  };
  const onBook = () => {
    if (over) {
      Alert.alert("This class looks full", "Book anyway?", [
        { text: "Cancel", style: "cancel" },
        { text: "Book anyway", onPress: doBook },
      ]);
    } else {
      doBook();
    }
  };

  return (
    <Card variant="hero" style={{ gap: 12, marginBottom: 20 }}>
      <Eyebrow>{booked ? "Your next class" : "Book your next class"}</Eyebrow>
      <View style={{ gap: 4 }}>
        <Txt size={18} weight={600}>
          {c.title}
        </Txt>
        <Mono size={14} tone="muted">
          {whenLabel(c.startsAt)} · {spotsLeftLabel(c.capacity, c.bookingCount)}
        </Mono>
      </View>
      {error ? (
        <Txt size={14} tone="error">
          {error}
        </Txt>
      ) : null}
      {booked ? (
        <Txt size={16} weight={600} tone="brand">
          ✓ You&apos;re booked
        </Txt>
      ) : (
        <Button
          label={book.isPending ? "Booking…" : "Book"}
          disabled={book.isPending}
          onPress={onBook}
        />
      )}
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

  const featured = useMemo(
    () => nextBookableClass(week.data ?? [], new Date()),
    [week.data],
  );

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
            Pending approval — you can browse and book; your gym will confirm
            you soon.
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
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {featured && <NextClassCard c={featured} />}
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
