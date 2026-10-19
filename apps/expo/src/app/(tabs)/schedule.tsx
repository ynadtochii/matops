import { useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, useWindowDimensions, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown } from "lucide-react-native";

import {
  companyLabel,
  dayKey,
  dayMediumFmt,
  dayNumFmt,
  groupByDay,
  spotsLeftLabel,
  startsInLabel,
  studentWeekWindow,
  timeFmt,
  weekdayFmt,
} from "@matops/domain";

import type { Booking } from "~/components/book-control";
import type { RouterOutputs } from "~/utils/api";
import { AppHeader } from "~/components/app-header";
import { BookControl, useBooking } from "~/components/book-control";
import { ClassShare } from "~/components/class-share";
import { Discipline } from "~/components/discipline";
import { OverdueBanner } from "~/components/overdue-banner";
import { useRefreshControl } from "~/components/refresh";
import { ScheduleSkeleton } from "~/components/skeletons";
import { SuspendedNotice } from "~/components/suspended-notice";
import {
  Badge,
  Callout,
  Card,
  CountBadge,
  EmptyState,
  ErrorState,
  Heading,
  List,
  Meter,
  Muted,
  Screen,
  Txt,
  useTheme,
} from "~/components/ui";
import { useMinuteClock } from "~/components/use-clock";
import { trpc } from "~/utils/api";

type ClassRow = RouterOutputs["class"]["mine"][number];

const GAP = 12;

function dayName(key: string, todayKey: string, tomorrowKey: string) {
  if (key === todayKey) return "Today";
  if (key === tomorrowKey) return "Tomorrow";
  return dayMediumFmt.format(new Date(`${key}T12:00:00`));
}

function BookedBadge() {
  const t = useTheme();
  return (
    <Badge
      label="Booked"
      icon={<Check size={12} color={t.foregroundSecondary} />}
    />
  );
}

function LitBar() {
  const t = useTheme();
  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        width: 2,
        backgroundColor: t.foreground,
      }}
    />
  );
}

function Meta({ c }: { c: ClassRow }) {
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "center",
        columnGap: 12,
        rowGap: 4,
      }}
    >
      {c.discipline ? <Discipline name={c.discipline} /> : null}
      {c.instructorName ? (
        <Txt size={13} tone="muted">
          {c.instructorName}
        </Txt>
      ) : null}
      {c.status === "cancelled" ? (
        <Txt size={13} weight={500} tone="error">
          Cancelled
        </Txt>
      ) : null}
    </View>
  );
}

export default function Schedule() {
  const router = useRouter();
  const current = useQuery(trpc.academy.current.queryOptions());
  const booking = useBooking();
  const now = useMinuteClock();
  const todayKey = dayKey(now);
  const tomorrowKey = dayKey(new Date(now.getTime() + 86_400_000));

  const suspended = current.data?.status === "suspended";
  const week = useQuery(
    trpc.class.mine.queryOptions(studentWeekWindow(now), {
      enabled: !suspended,
    }),
  );
  const byDay = useMemo(() => groupByDay(week.data ?? []), [week.data]);
  const refreshControl = useRefreshControl();
  const scroll = useRef<ScrollView>(null);
  const sectionY = useRef(new Map<string, number>());

  if (suspended) return <SuspendedNotice name={current.data?.name} />;

  const open = (id: string) => router.push(`/class/${id}`);
  const ahead = (week.data ?? []).filter(
    (c) => c.status !== "cancelled" && new Date(c.startsAt) > now,
  );
  const featuredKey = ahead[0] && dayKey(new Date(ahead[0].startsAt));
  const featured = ahead.filter(
    (c) => dayKey(new Date(c.startsAt)) === featuredKey,
  );

  return (
    <Screen header={<AppHeader />} style={{ paddingBottom: 0 }}>
      <OverdueBanner />
      {week.isPending ? (
        <ScheduleSkeleton />
      ) : (
        <ScrollView
          ref={scroll}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
          stickyHeaderIndices={byDay.length > 0 ? [2] : undefined}
        >
          <View style={{ gap: 4, marginBottom: 16 }}>
            <Heading>Schedule</Heading>
            <Muted>
              {`Find and book a class for the next ${current.data?.bookingWindowDays ?? 7} days.`}
            </Muted>
          </View>

          <View>
            {booking.lockedMessage ? (
              <View style={{ marginBottom: 16 }}>
                <Callout tone="warning" title="Booking unavailable">
                  {booking.lockedMessage}
                </Callout>
              </View>
            ) : null}
            {week.isError ? (
              <ErrorState
                label="your schedule"
                onRetry={() => void week.refetch()}
              />
            ) : byDay.length === 0 ? (
              <EmptyState
                title="No classes this week."
                body="Your gym will show new classes here when they are scheduled."
              />
            ) : featuredKey ? (
              <DayCarousel
                key={featuredKey}
                classes={featured}
                now={now}
                day={dayName(featuredKey, todayKey, tomorrowKey)}
                booking={booking}
                onOpen={open}
              />
            ) : null}
          </View>

          {byDay.length > 0 ? (
            <DayChips
              days={byDay}
              todayKey={todayKey}
              tomorrowKey={tomorrowKey}
              onPick={(key) => {
                const y = sectionY.current.get(key);
                if (y != null) scroll.current?.scrollTo({ y, animated: true });
              }}
            />
          ) : null}

          {byDay.length > 0 ? (
            <View style={{ gap: 32, paddingTop: 8 }}>
              {byDay.map(([key, rows]) => (
                <DaySection
                  key={key}
                  label={dayName(key, todayKey, tomorrowKey)}
                  dateLine={key === todayKey ? dayMediumFmt.format(now) : null}
                  rows={rows}
                  now={now}
                  booking={booking}
                  onOpen={open}
                  onLayout={(y) => sectionY.current.set(key, y)}
                />
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}

function DayCarousel({
  classes,
  now,
  day,
  booking,
  onOpen,
}: {
  classes: ClassRow[];
  now: Date;
  day: string;
  booking: Booking;
  onOpen: (id: string) => void;
}) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const many = classes.length > 1;
  const cardWidth = many ? Math.round((width - 32) * 0.85) : width - 32;
  const step = cardWidth + GAP;
  const track = useRef<ScrollView>(null);
  const [firstBooked] = useState(() =>
    Math.max(
      classes.findIndex((c) => c.myBooking === "booked"),
      0,
    ),
  );
  const [index, setIndex] = useState(firstBooked);

  return (
    <View style={{ marginBottom: 24 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <Txt size={15} weight={600}>
          {day}
        </Txt>
        <Txt size={13} tone="muted" tabular>
          {`${classes.length} ${classes.length === 1 ? "class" : "classes"} to go`}
        </Txt>
      </View>
      <ScrollView
        ref={track}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        onLayout={() =>
          track.current?.scrollTo({ x: firstBooked * step, animated: false })
        }
        onMomentumScrollEnd={(e) =>
          setIndex(Math.round(e.nativeEvent.contentOffset.x / step))
        }
        style={{ marginHorizontal: -16 }}
        contentContainerStyle={{
          gap: GAP,
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        {classes.map((c, i) => (
          <FeaturedClass
            key={c.id}
            c={c}
            now={now}
            width={cardWidth}
            label={`${i + 1} of ${classes.length}`}
            booking={booking}
            onOpen={onOpen}
          />
        ))}
      </ScrollView>
      {many ? (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            gap: 4,
            marginTop: 4,
          }}
        >
          {classes.map((c, i) => (
            <View
              key={c.id}
              style={{
                height: 4,
                width: i === index ? 16 : 6,
                borderRadius: 2,
                backgroundColor: i === index ? t.foreground : t.track,
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function FeaturedClass({
  c,
  now,
  width,
  label,
  booking,
  onOpen,
}: {
  c: ClassRow;
  now: Date;
  width: number;
  label: string;
  booking: Booking;
  onOpen: (id: string) => void;
}) {
  const start = new Date(c.startsAt);
  const booked = c.myBooking === "booked";
  const startsIn = startsInLabel(start, now);

  return (
    <Card
      variant="raised"
      padded={false}
      style={{ width, padding: 20, overflow: "hidden" }}
    >
      {booked ? <LitBar /> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${c.title} at ${timeFmt.format(start)}`}
        onPress={() => onOpen(c.id)}
        style={{ gap: 4 }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View
            style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}
          >
            <Txt size={30} weight={500} tracking={-0.6} tabular>
              {timeFmt.format(start)}
            </Txt>
            <Txt size={13} tone="muted" tabular>
              {`${c.durationMinutes} min`}
            </Txt>
          </View>
          {booked ? <BookedBadge /> : null}
        </View>
        <Txt size={17} weight={600} style={{ marginTop: 4 }}>
          {c.title}
        </Txt>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            columnGap: 12,
            rowGap: 4,
          }}
        >
          {c.instructorName ? (
            <Txt size={13} tone="muted">
              {`with ${c.instructorName}`}
            </Txt>
          ) : null}
          {c.discipline ? <Discipline name={c.discipline} /> : null}
        </View>
        {startsIn ? (
          <Txt size={13} tone="secondary">
            {startsIn}
          </Txt>
        ) : null}
      </Pressable>
      <View style={{ gap: 8, paddingTop: 20 }}>
        <Txt size={13} tone="muted" tabular>
          {booked
            ? companyLabel(c.bookingCount)
            : spotsLeftLabel(c.capacity, c.bookingCount)}
        </Txt>
        {c.capacity > 0 ? (
          <Meter
            value={c.bookingCount}
            max={c.capacity}
            label={`${c.bookingCount} of ${c.capacity} spots taken`}
          />
        ) : null}
      </View>
      <View style={{ marginTop: 16 }}>
        <BookControl
          c={c}
          booked={booked}
          booking={booking}
          variant="primary"
        />
      </View>
    </Card>
  );
}

function DayChips({
  days,
  todayKey,
  tomorrowKey,
  onPick,
}: {
  days: [string, ClassRow[]][];
  todayKey: string;
  tomorrowKey: string;
  onPick: (key: string) => void;
}) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.background, paddingVertical: 8 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 4 }}
      >
        {days.map(([key, rows]) => {
          const date = new Date(`${key}T12:00:00`);
          const today = key === todayKey;
          const mine = rows.some(
            (c) => c.myBooking === "booked" && c.status !== "cancelled",
          );
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={`${dayName(key, todayKey, tomorrowKey)}, ${rows.length} ${rows.length === 1 ? "class" : "classes"}${mine ? ", you are booked" : ""}`}
              onPress={() => onPick(key)}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                minHeight: 44,
                paddingHorizontal: 12,
                borderRadius: 5,
                borderWidth: 1,
                borderColor: today ? t.edgeLit : "transparent",
                backgroundColor: today
                  ? t.surface2
                  : pressed
                    ? t.hover
                    : "transparent",
              })}
            >
              <Txt size={13} tone={today ? "default" : "muted"} tabular>
                {today
                  ? "Today"
                  : `${weekdayFmt.format(date)} ${dayNumFmt.format(date)}`}
              </Txt>
              <CountBadge count={rows.length} />
              {mine ? (
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: t.foreground,
                  }}
                />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function DaySection({
  label,
  dateLine,
  rows,
  now,
  booking,
  onOpen,
  onLayout,
}: {
  label: string;
  dateLine: string | null;
  rows: ClassRow[];
  now: Date;
  booking: Booking;
  onOpen: (id: string) => void;
  onLayout: (y: number) => void;
}) {
  const t = useTheme();
  const [showEarlier, setShowEarlier] = useState(false);
  const upcoming = rows.filter((c) => new Date(c.startsAt) > now);
  const earlier = rows.filter((c) => new Date(c.startsAt) <= now);
  const row = (c: ClassRow) => (
    <ClassRowCard
      key={c.id}
      c={c}
      now={now}
      booking={booking}
      onOpen={onOpen}
    />
  );

  return (
    <View onLayout={(e) => onLayout(e.nativeEvent.layout.y)}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <Txt size={15} weight={600}>
          {label}
        </Txt>
        {dateLine ? (
          <Txt size={13} tone="muted">
            {dateLine}
          </Txt>
        ) : null}
      </View>
      <View style={{ gap: 8 }}>
        {upcoming.length > 0 ? (
          <List>{upcoming.map(row)}</List>
        ) : (
          <Txt size={13} tone="muted" style={{ paddingVertical: 8 }}>
            No more classes today.
          </Txt>
        )}
        {earlier.length > 0 ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showEarlier }}
              onPress={() => setShowEarlier((v) => !v)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                minHeight: 44,
              }}
            >
              <Txt size={13} tone="muted">
                {`Earlier today (${earlier.length})`}
              </Txt>
              <ChevronDown
                size={14}
                color={t.mutedForeground}
                style={{
                  transform: [{ rotate: showEarlier ? "180deg" : "0deg" }],
                }}
              />
            </Pressable>
            {showEarlier ? <List>{earlier.map(row)}</List> : null}
          </>
        ) : null}
      </View>
    </View>
  );
}

function ClassRowCard({
  c,
  now,
  booking,
  onOpen,
}: {
  c: ClassRow;
  now: Date;
  booking: Booking;
  onOpen: (id: string) => void;
}) {
  const t = useTheme();
  const start = new Date(c.startsAt);
  const cancelled = c.status === "cancelled";
  const booked = c.myBooking === "booked" && !cancelled;
  const past = start.getTime() <= now.getTime();

  return (
    <View
      style={[
        { padding: 16 },
        booked && { backgroundColor: t.raised },
        past && { opacity: 0.6 },
      ]}
    >
      {booked ? <LitBar /> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${c.title} at ${timeFmt.format(start)}`}
        onPress={() => onOpen(c.id)}
        style={{ gap: 4 }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View
            style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}
          >
            <Txt size={15} weight={500} tabular>
              {timeFmt.format(start)}
            </Txt>
            <Txt size={12} tone="muted" tabular>
              {`${c.durationMinutes} min`}
            </Txt>
          </View>
          {booked ? <BookedBadge /> : null}
        </View>
        <Txt
          size={15}
          weight={600}
          tone={cancelled ? "muted" : "default"}
          style={cancelled ? { textDecorationLine: "line-through" } : undefined}
        >
          {c.title}
        </Txt>
        <Meta c={c} />
      </Pressable>

      {!cancelled ? (
        <View style={{ gap: 12, marginTop: 16 }}>
          <View style={{ gap: 6 }}>
            <Txt size={12} tone="muted" tabular>
              {spotsLeftLabel(c.capacity, c.bookingCount)}
            </Txt>
            {c.capacity > 0 ? (
              <Meter
                value={c.bookingCount}
                max={c.capacity}
                label={`${c.bookingCount} of ${c.capacity} spots taken`}
              />
            ) : null}
          </View>
          {!past ? (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <View style={{ flex: 1 }}>
                <BookControl c={c} booked={booked} booking={booking} />
              </View>
              <ClassShare cls={c} iconOnly />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
