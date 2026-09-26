import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { nextClass, splitMyClasses } from "@matops/domain";

import type { RouterOutputs } from "~/utils/api";
import { AppHeader } from "~/components/app-header";
import { useCancelBooking } from "~/components/book-control";
import { OverdueBanner } from "~/components/overdue-banner";
import { useRefreshControl } from "~/components/refresh";
import { MyClassesSkeleton } from "~/components/skeletons";
import { SuspendedNotice } from "~/components/suspended-notice";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Eyebrow,
  Heading,
  List,
  ListRow,
  Mono,
  Muted,
  Screen,
  StatusPill,
  Txt,
} from "~/components/ui";
import { trpc } from "~/utils/api";
import { dayLongFmt, timeFmt } from "~/utils/format";

type MyClass = RouterOutputs["booking"]["mine"][number];

/** The next upcoming class, shown large at the top of the tab (slice B.2 / C). */
function NextClassCard({ c, onPress }: { c: MyClass; onPress: () => void }) {
  const start = new Date(c.startsAt);
  return (
    <View style={{ gap: 8 }}>
      <Eyebrow>Next class</Eyebrow>
      <Card variant="hero" onPress={onPress} style={{ gap: 4 }}>
        <Txt size={17} weight={600} tracking={-0.25}>
          {c.title}
        </Txt>
        <Mono size={13} weight={400} tone="secondary">
          {dayLongFmt.format(start)} · {timeFmt.format(start)}
        </Mono>
        {c.bookingTier === "provisional" ? (
          <Txt size={13} tone="secondary">
            Pending approval
          </Txt>
        ) : null}
      </Card>
    </View>
  );
}

/** One row in the Upcoming or Past list. */
function ClassRow({
  c,
  onPress,
  action,
}: {
  c: MyClass;
  onPress: () => void;
  action?: React.ReactNode;
}) {
  const start = new Date(c.startsAt);
  const cancelled = c.status === "cancelled";
  return (
    <ListRow>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flex: 1, gap: 4 }}>
          <Txt size={15} weight={500} onPress={onPress}>
            <Mono size={15} weight={500}>
              {timeFmt.format(start)}
            </Mono>
            {`  ${c.title}`}
          </Txt>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Mono size={13} tone="muted">
              {dayLongFmt.format(start)}
            </Mono>
            {cancelled ? (
              <StatusPill tone="error" label="Cancelled" />
            ) : c.bookingTier === "provisional" ? (
              <Txt size={12} tone="secondary">
                Pending approval
              </Txt>
            ) : null}
          </View>
        </View>
        {action}
      </View>
    </ListRow>
  );
}

/**
 * Training tab (spec S6 "My classes" + slice B.2, ADR 39). The student's own
 * view: the next class up top, a "My Training" stats card, then Upcoming
 * (still booked) and Past (attended) lists. `splitMyClasses` / `nextClass`
 * divide the `booking.mine` data; cancel reuses `booking.cancel`.
 */
export default function Training() {
  const router = useRouter();
  const current = useQuery(trpc.academy.current.queryOptions());
  // Suspended members have no enrolled access — gate the query + show a notice.
  const suspended = current.data?.status === "suspended";
  const mine = useQuery(
    trpc.booking.mine.queryOptions(undefined, { enabled: !suspended }),
  );

  const { onCancel, pendingClassId } = useCancelBooking();

  const refreshControl = useRefreshControl();
  const now = new Date();
  const { upcoming, past } = splitMyClasses(mine.data ?? [], now);
  const next = nextClass(upcoming, now);
  const rest = next
    ? upcoming.filter((c) => c.classId !== next.classId)
    : upcoming;

  const openClass = (id: string) =>
    router.push({ pathname: "/class/[id]", params: { id } });

  if (suspended) return <SuspendedNotice name={current.data?.name} />;

  return (
    <Screen header={<AppHeader />}>
      <OverdueBanner />

      <View style={{ marginBottom: 16 }}>
        <Heading>My classes</Heading>
        <Muted>What you booked, and what you have trained.</Muted>
      </View>

      {mine.isPending ? (
        <MyClassesSkeleton />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: 24, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={refreshControl}
        >
          {mine.isError ? (
            <ErrorState
              label="your classes"
              onRetry={() => void mine.refetch()}
            />
          ) : (
            <>
              {next ? (
                <NextClassCard
                  c={next}
                  onPress={() => openClass(next.classId)}
                />
              ) : null}

              {upcoming.length === 0 ? (
                <View style={{ gap: 8 }}>
                  <Eyebrow>Upcoming</Eyebrow>
                  <EmptyState
                    title="Nothing booked yet."
                    body="Book a class from the schedule and it shows up here."
                  />
                </View>
              ) : rest.length > 0 ? (
                <View style={{ gap: 8 }}>
                  <Eyebrow>Upcoming</Eyebrow>
                  <List>
                    {rest.map((c) => (
                      <ClassRow
                        key={c.classId}
                        c={c}
                        onPress={() => openClass(c.classId)}
                        action={
                          c.status === "cancelled" ? undefined : (
                            <Button
                              label="Cancel"
                              variant="destructive"
                              loading={pendingClassId === c.classId}
                              onPress={() => onCancel(c.classId)}
                            />
                          )
                        }
                      />
                    ))}
                  </List>
                </View>
              ) : null}

              {past.length > 0 ? (
                <View style={{ gap: 8 }}>
                  <Eyebrow>Past</Eyebrow>
                  <List>
                    {past.map((c) => (
                      <ClassRow
                        key={c.classId}
                        c={c}
                        onPress={() => openClass(c.classId)}
                      />
                    ))}
                  </List>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
