import { useMemo } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import type { DisciplineTone } from "@matops/domain";
import {
  capacityDisplay,
  disciplineTone,
  studentWeekWindow,
} from "@matops/domain";

import type { Theme } from "~/components/theme";
import type { RouterOutputs } from "~/utils/api";
import { AppHeader } from "~/components/app-header";
import { BookButton, CancelButton } from "~/components/book-control";
import { OverdueBanner } from "~/components/overdue-banner";
import { useRefreshControl } from "~/components/refresh";
import { ScheduleSkeleton } from "~/components/skeletons";
import { SuspendedNotice } from "~/components/suspended-notice";
import {
  Banner,
  EmptyState,
  ErrorState,
  Heading,
  List,
  Muted,
  Screen,
  StatusPill,
  Txt,
  useTheme,
} from "~/components/ui";
import { trpc } from "~/utils/api";
import {
  clockParts,
  dayFmt,
  dayKey,
  fillLabel,
  groupByDay,
  spotsLeftLabel,
} from "~/utils/format";

type ClassRow = RouterOutputs["class"]["mine"][number];

/** The discipline rail colour. Same tones the web schedule paints (ADR 53). */
const toneColorOf = (t: Theme): Record<DisciplineTone, string> => ({
  gi: t.gi,
  nogi: t.nogi,
  other: t.border,
});

function railColor(t: Theme, discipline: string | null, cancelled: boolean) {
  if (cancelled) return `${t.error}66`;
  return toneColorOf(t)[disciplineTone(discipline)];
}

/** The day rule: the day label over its list, with the class count. */
function DayRule({ label, meta }: { label: string; meta: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        paddingHorizontal: 2,
      }}
    >
      <Txt size={13} weight={500} tone="secondary">
        {label}
      </Txt>
      <Txt size={13} tone="muted" style={{ fontVariant: ["tabular-nums"] }}>
        {meta}
      </Txt>
    </View>
  );
}

function Chevron() {
  return (
    <Txt size={18} tone="muted">
      ›
    </Txt>
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
  const t = useTheme();
  const cancelled = c.status === "cancelled";
  const booked = c.myBooking === "booked";
  const past = new Date(c.startsAt).getTime() <= now.getTime();
  const bookable = !cancelled && !booked && !past;
  const { clock, period } = clockParts(new Date(c.startsAt));
  const full = capacityDisplay(c.bookingCount, c.capacity).isOver;
  const card = (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        { flexDirection: "row", alignItems: "stretch" },
        pressed && { backgroundColor: t.hover },
      ]}
    >
      <View
        style={{
          width: 3,
          backgroundColor: railColor(t, c.discipline, cancelled),
        }}
      />
      <View
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          minHeight: 64,
          paddingVertical: 12,
          paddingHorizontal: 12,
        }}
      >
        <View style={{ width: 48, alignItems: "flex-end" }}>
          <Txt
            data
            size={15}
            weight={500}
            tone={cancelled ? "muted" : "default"}
            style={cancelled ? { textDecorationLine: "line-through" } : null}
          >
            {clock}
          </Txt>
          {period ? (
            <Txt data size={12} tone="muted">
              {period}
            </Txt>
          ) : null}
        </View>

        <View style={{ flex: 1, gap: 4 }}>
          <Txt
            size={15}
            weight={500}
            tone={cancelled ? "muted" : "default"}
            numberOfLines={1}
          >
            {c.title}
          </Txt>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            {cancelled ? (
              <StatusPill tone="error" label="Cancelled" />
            ) : booked ? (
              <>
                <StatusPill tone="info" label="Booked" />
                <Txt
                  size={13}
                  tone={full ? "warning" : "muted"}
                  style={{ fontVariant: ["tabular-nums"] }}
                >
                  {fillLabel(c.capacity, c.bookingCount)}
                </Txt>
              </>
            ) : past ? null : (
              <Txt
                size={13}
                tone={full ? "warning" : "muted"}
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {spotsLeftLabel(c.capacity, c.bookingCount)}
              </Txt>
            )}
            {c.discipline ? (
              <Txt size={13} tone="muted">
                {c.discipline}
              </Txt>
            ) : null}
            {c.instructorName ? (
              <Txt size={13} tone="muted" numberOfLines={1}>
                {c.instructorName}
              </Txt>
            ) : null}
          </View>
        </View>

        {cancelled ? (
          <Chevron />
        ) : bookable ? (
          <BookButton c={c} />
        ) : booked && !past ? (
          <CancelButton classId={c.id} />
        ) : (
          <Chevron />
        )}
      </View>
    </Pressable>
  );

  // A class that has already started is no longer actionable — it stays
  // readable (and tappable for the roster) but drops out of the scan.
  return past && !cancelled ? (
    <View style={{ opacity: 0.5 }}>{card}</View>
  ) : (
    card
  );
}

/**
 * Schedule home (spec S4) — the student's rolling week, grouped by day (Today
 * first). A pending member browses here behind the S3 banner (no waiting wall).
 * Booking is one tap on the row; tapping the row body opens the detail (S5).
 */
export default function Schedule() {
  const router = useRouter();
  const current = useQuery(trpc.academy.current.queryOptions());

  const now = new Date();
  const todayKey = dayKey(now);
  const { from, to } = studentWeekWindow(now);

  const suspended = current.data?.status === "suspended";
  const selfWeek = useQuery(
    trpc.class.mine.queryOptions({ from, to }, { enabled: !suspended }),
  );
  const week = selfWeek;

  const byDay = useMemo(() => groupByDay(week.data ?? []), [week.data]);

  const isPending = current.data?.status === "pending";
  const refreshControl = useRefreshControl();

  if (suspended) return <SuspendedNotice name={current.data?.name} />;

  return (
    <Screen header={<AppHeader />}>
      <OverdueBanner />

      <View style={{ marginBottom: 16 }}>
        <Heading>Schedule</Heading>
        <Muted>
          Your classes for the next {current.data?.bookingWindowDays ?? 7} days.
        </Muted>
      </View>

      {isPending && (
        <View style={{ marginBottom: 16 }}>
          <Banner tone="neutral">
            Waiting for approval. You can browse and book; your gym will confirm
            you soon.
          </Banner>
        </View>
      )}

      {week.isPending ? (
        <ScheduleSkeleton />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          {week.isError ? (
            <ErrorState
              label="your schedule"
              onRetry={() => void week.refetch()}
            />
          ) : byDay.length === 0 ? (
            <EmptyState
              title="No classes this week."
              body="Check back soon. Your gym adds classes here as they schedule them."
            />
          ) : (
            <View style={{ gap: 20 }}>
              {byDay.map(([key, rows]) => (
                <View key={key} style={{ gap: 8 }}>
                  <DayRule
                    label={dayFmt.format(new Date(`${key}T12:00:00`))}
                    meta={`${key === todayKey ? "today · " : ""}${rows.length} ${
                      rows.length === 1 ? "class" : "classes"
                    }`}
                  />
                  <List>
                    {rows.map((c) => (
                      <ClassCard
                        key={c.id}
                        c={c}
                        now={now}
                        onPress={() => router.push(`/class/${c.id}`)}
                      />
                    ))}
                  </List>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
