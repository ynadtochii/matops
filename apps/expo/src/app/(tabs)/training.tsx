import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { nextClass, splitMyClasses } from "@matops/domain";

import type { RouterOutputs } from "~/utils/api";
import { MyTrainingCard } from "~/components/my-training-card";
import { OverdueBanner } from "~/components/overdue-banner";
import { useToast } from "~/components/toast";
import {
  Button,
  Card,
  confirm,
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
} from "~/components/ui";
import { trpc } from "~/utils/api";
import { dayLongFmt, timeFmt } from "~/utils/format";

type MyClass = RouterOutputs["booking"]["mine"][number];

/** The next upcoming class, shown large at the top of the tab (slice B.2 / C). */
function NextClassCard({ c, onPress }: { c: MyClass; onPress: () => void }) {
  const start = new Date(c.startsAt);
  return (
    <View style={{ gap: 12 }}>
      <Eyebrow>Next class</Eyebrow>
      <Card variant="hero" onPress={onPress} style={{ gap: 4 }}>
        <Txt size={18} weight={600}>
          {c.title}
        </Txt>
        <Mono size={14}>
          {dayLongFmt.format(start)} · {timeFmt.format(start)}
        </Mono>
        {c.bookingTier === "provisional" ? (
          <Txt size={13} tone="brand">
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
    <Card variant="filled">
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flex: 1, gap: 4 }}>
          <Txt size={16} weight={500} onPress={onPress}>
            <Mono size={16} weight={600}>
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
              <Txt size={12} tone="brand">
                Pending approval
              </Txt>
            ) : null}
          </View>
        </View>
        {action}
      </View>
    </Card>
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
  const queryClient = useQueryClient();
  const toast = useToast();
  const mine = useQuery(trpc.booking.mine.queryOptions());

  const cancel = useMutation(
    trpc.booking.cancel.mutationOptions({
      onSuccess: async () => {
        toast.show("Booking cancelled");
        await queryClient.invalidateQueries(trpc.booking.pathFilter());
        await queryClient.invalidateQueries(trpc.class.pathFilter());
      },
    }),
  );

  const now = new Date();
  const { upcoming, past } = splitMyClasses(mine.data ?? [], now);
  const next = nextClass(upcoming, now);
  const rest = next
    ? upcoming.filter((c) => c.classId !== next.classId)
    : upcoming;

  const openClass = (id: string) =>
    router.push({ pathname: "/class/[id]", params: { id } });

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
        <Heading>My classes</Heading>
        <Mark size={26} />
      </View>

      {mine.isPending ? (
        <InlineLoading />
      ) : mine.isError ? (
        <ErrorState label="your classes" onRetry={() => void mine.refetch()} />
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: 24, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          {next ? (
            <NextClassCard c={next} onPress={() => openClass(next.classId)} />
          ) : null}

          <MyTrainingCard />

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
                        loading={
                          cancel.isPending &&
                          cancel.variables.classId === c.classId
                        }
                        onPress={() =>
                          confirm({
                            title: "Cancel this booking?",
                            message:
                              "You'll lose your spot. If the class is full, you may not get it back.",
                            confirmLabel: "Cancel booking",
                            cancelLabel: "Keep it",
                            onConfirm: () =>
                              cancel.mutate({ classId: c.classId }),
                          })
                        }
                      />
                    )
                  }
                />
              ))}
            </View>
          ) : null}

          {past.length > 0 ? (
            <View style={{ gap: 8 }}>
              <Eyebrow>Past</Eyebrow>
              {past.map((c) => (
                <ClassRow
                  key={c.classId}
                  c={c}
                  onPress={() => openClass(c.classId)}
                />
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
}
