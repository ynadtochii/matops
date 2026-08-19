import { useMemo } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import type { DisciplineTone } from "@matops/domain";
import { capacityDisplay, disciplineTone } from "@matops/domain";

import type { Theme } from "~/components/theme";
import type { RouterOutputs } from "~/utils/api";
import { BookButton, CancelButton } from "~/components/book-control";
import { OverdueBanner } from "~/components/overdue-banner";
import { useRefreshControl } from "~/components/refresh";
import { SuspendedNotice } from "~/components/suspended-notice";
import {
  Banner,
  Card,
  EmptyState,
  ErrorState,
  Eyebrow,
  Heading,
  InlineLoading,
  Mark,
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
  spotsLeftLabel,
} from "~/utils/format";

type ClassRow = RouterOutputs["class"]["mine"][number];

/** Local midnight today — the start of the rolling week window. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

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

/** The day rule — mono day label between hairlines, with the class count. */
function DayRule({ label, meta }: { label: string; meta: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ width: 16, height: 1, backgroundColor: t.border }} />
      <Eyebrow>{label}</Eyebrow>
      <View style={{ flex: 1, height: 1, backgroundColor: t.border }} />
      <Eyebrow>{meta}</Eyebrow>
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
    <Card
      variant={cancelled ? "outline" : "filled"}
      onPress={onPress}
      padded={false}
      style={[
        { overflow: "hidden" },
        booked && !cancelled ? { borderColor: t.brand } : null,
      ]}
    >
      <View style={{ flexDirection: "row", alignItems: "stretch" }}>
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
            paddingVertical: 12,
            paddingHorizontal: 12,
          }}
        >
          <View style={{ width: 48, alignItems: "flex-end" }}>
            <Txt
              data
              size={15}
              weight={600}
              tone={cancelled ? "muted" : "default"}
              style={cancelled ? { textDecorationLine: "line-through" } : null}
            >
              {clock}
            </Txt>
            {period ? (
              <Txt data size={10} weight={500} tone="muted">
                {period}
              </Txt>
            ) : null}
          </View>

          <View style={{ flex: 1, gap: 5 }}>
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
                  <Txt
                    data
                    size={11}
                    weight={600}
                    uppercase
                    tracking={0.8}
                    tone="brand"
                  >
                    Booked
                  </Txt>
                  <Txt
                    data
                    size={11}
                    weight={600}
                    uppercase
                    tracking={0.8}
                    tone={full ? "warning" : "muted"}
                  >
                    {fillLabel(c.capacity, c.bookingCount)}
                  </Txt>
                </>
              ) : past ? null : (
                <Txt
                  data
                  size={11}
                  weight={600}
                  uppercase
                  tracking={0.8}
                  tone={full ? "warning" : "muted"}
                >
                  {spotsLeftLabel(c.capacity, c.bookingCount)}
                </Txt>
              )}
              {c.discipline ? <Eyebrow>{c.discipline}</Eyebrow> : null}
              {c.instructorName ? (
                <Txt size={12} tone="muted" numberOfLines={1}>
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
      </View>
    </Card>
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
  const windowStart = startOfToday();
  const windowEnd = new Date(windowStart);
  windowEnd.setDate(windowEnd.getDate() + 7);
  const from = windowStart.toISOString();
  const to = windowEnd.toISOString();

  // A suspended member has no enrolled access — the server rejects `class.mine`.
  // Gate the query off and show a calm notice instead of a load error (§4).
  const suspended = current.data?.status === "suspended";
  const week = useQuery(
    trpc.class.mine.queryOptions({ from, to }, { enabled: !suspended }),
  );

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
  const refreshControl = useRefreshControl();

  if (suspended) return <SuspendedNotice name={current.data?.name} />;

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
              body="Check back soon — your gym adds classes here as they schedule them."
            />
          ) : (
            <View style={{ gap: 20 }}>
              {byDay.map(([key, rows]) => (
                <View key={key} style={{ gap: 10 }}>
                  <DayRule
                    label={dayFmt.format(new Date(`${key}T12:00:00`))}
                    meta={`${key === todayKey ? "today · " : ""}${rows.length} ${
                      rows.length === 1 ? "class" : "classes"
                    }`}
                  />
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
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
