import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import {
  dayMediumFmt,
  nextClass,
  splitMyClasses,
  timeFmt,
} from "@matops/domain";

import type { RouterOutputs } from "~/utils/api";
import { AppHeader } from "~/components/app-header";
import { useBooking } from "~/components/book-control";
import { OverdueBanner } from "~/components/overdue-banner";
import { useRefreshControl } from "~/components/refresh";
import { MyClassesSkeleton } from "~/components/skeletons";
import { SuspendedNotice } from "~/components/suspended-notice";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Heading,
  List,
  Muted,
  Screen,
  Tabs,
  Txt,
} from "~/components/ui";
import { useMinuteClock } from "~/components/use-clock";
import { trpc } from "~/utils/api";

type MyClass = RouterOutputs["booking"]["mine"][number];

function ClassRow({
  c,
  next,
  onPress,
  action,
}: {
  c: MyClass;
  next: boolean;
  onPress: () => void;
  action?: React.ReactNode;
}) {
  const start = new Date(c.startsAt);
  const cancelled = c.status === "cancelled";
  return (
    <View style={{ gap: 12, paddingHorizontal: 16, paddingVertical: 12 }}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={{ gap: 4 }}
      >
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            columnGap: 12,
            rowGap: 4,
          }}
        >
          <Txt size={15} weight={500} tabular>
            {timeFmt.format(start)}
          </Txt>
          <Txt
            size={15}
            weight={600}
            style={
              cancelled ? { textDecorationLine: "line-through" } : undefined
            }
          >
            {c.title}
          </Txt>
          {next ? <Badge label="Next class" tone="lit" /> : null}
        </View>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            columnGap: 12,
            rowGap: 4,
          }}
        >
          <Txt size={13} tone="muted">
            {dayMediumFmt.format(start)}
          </Txt>
          {c.discipline ? (
            <Txt size={12} tone="muted">
              {c.discipline}
            </Txt>
          ) : null}
          {cancelled ? (
            <Txt size={13} weight={500} tone="error">
              Cancelled
            </Txt>
          ) : c.bookingTier === "provisional" ? (
            <Badge label="Pending approval" />
          ) : null}
        </View>
      </Pressable>
      {action}
    </View>
  );
}

export default function Training() {
  const router = useRouter();
  const [view, setView] = useState<"upcoming" | "attended">("upcoming");
  const current = useQuery(trpc.academy.current.queryOptions());
  const suspended = current.data?.status === "suspended";
  const mine = useQuery(
    trpc.booking.mine.queryOptions(undefined, {
      enabled: !!current.data && !suspended,
    }),
  );
  const { cancel, busyFor } = useBooking();
  const refreshControl = useRefreshControl();
  const now = useMinuteClock();

  if (suspended) return <SuspendedNotice name={current.data?.name} />;

  const { upcoming, past } = splitMyClasses(mine.data ?? [], now);
  const next = nextClass(
    upcoming.filter((c) => c.status !== "cancelled"),
    now,
  );
  const classes = view === "upcoming" ? upcoming : past;
  const openClass = (id: string) =>
    router.push({ pathname: "/class/[id]", params: { id } });

  return (
    <Screen header={<AppHeader />} style={{ paddingBottom: 0 }}>
      <OverdueBanner />
      <View style={{ gap: 4, marginBottom: 16 }}>
        <Heading>My classes</Heading>
        <Muted>Manage your bookings and review the classes you attended.</Muted>
      </View>

      {mine.isPending && !current.isError ? (
        <MyClassesSkeleton />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: 20, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          {mine.isError || current.isError ? (
            <ErrorState
              label="your classes"
              onRetry={() =>
                void (current.isError ? current.refetch() : mine.refetch())
              }
            />
          ) : (
            <>
              <Tabs
                value={view}
                onChange={setView}
                tabs={[
                  { id: "upcoming", label: `Upcoming (${upcoming.length})` },
                  { id: "attended", label: `Attended (${past.length})` },
                ]}
              />
              {view === "attended" ? (
                <Muted>
                  Classes appear here after your gym records your attendance.
                </Muted>
              ) : null}
              {classes.length === 0 ? (
                view === "upcoming" ? (
                  <EmptyState
                    title="No upcoming bookings"
                    body="Choose your next session from the schedule."
                    action={
                      <Button
                        label="Find a class"
                        onPress={() => router.navigate("/schedule")}
                      />
                    }
                  />
                ) : (
                  <EmptyState
                    title="No attendance recorded yet"
                    body="Your gym records attendance after each class."
                  />
                )
              ) : (
                <List>
                  {classes.map((c) => (
                    <ClassRow
                      key={c.classId}
                      c={c}
                      next={view === "upcoming" && c.classId === next?.classId}
                      onPress={() => openClass(c.classId)}
                      action={
                        view === "upcoming" && c.status !== "cancelled" ? (
                          <Button
                            label="Cancel booking"
                            variant="outline"
                            loading={busyFor(c.classId)}
                            accessibilityLabel={`Cancel booking for ${c.title} on ${dayMediumFmt.format(new Date(c.startsAt))}`}
                            onPress={() => cancel(c.classId)}
                          />
                        ) : undefined
                      }
                    />
                  ))}
                </List>
              )}
            </>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
