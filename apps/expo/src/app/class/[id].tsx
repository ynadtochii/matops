import { ScrollView, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import {
  canBook,
  capacityDisplay,
  isBjjAcademy,
  notBookableMessage,
} from "@matops/domain";

import { useBookClass, useCancelBooking } from "~/components/book-control";
import { ClassDetailSkeleton } from "~/components/skeletons";
import {
  Banner,
  Button,
  ErrorState,
  Eyebrow,
  Field,
  Heading,
  Mono,
  Muted,
  Screen,
  Txt,
  Stack as UIStack,
  useTheme,
} from "~/components/ui";
import { trpc } from "~/utils/api";
import { dayLongFmt, timeFmt } from "~/utils/format";

function WhoIsIn({
  classId,
  viewerBooked,
}: {
  classId: string;
  viewerBooked: boolean;
}) {
  const q = useQuery(trpc.class.attendees.queryOptions({ id: classId }));

  if (q.isPending || q.isError) return null;

  const { names, othersCount, namesHidden } = q.data;

  if (names.length === 0 && othersCount === 0) {
    return (
      <Field label="Who's in">
        <Muted>
          {viewerBooked ? "Just you so far." : "No one booked yet."}
        </Muted>
      </Field>
    );
  }

  return (
    <Field label="Who's in">
      <UIStack gap={4}>
        {names.length > 0 ? <Txt size={16}>{names.join(", ")}</Txt> : null}
        {othersCount > 0 ? (
          <Txt
            size={names.length > 0 ? 14 : 16}
            tone={names.length > 0 ? "muted" : "default"}
          >
            {names.length > 0 ? "+" : ""}
            {othersCount} {othersCount === 1 ? "other" : "others"}
          </Txt>
        ) : null}
        {namesHidden ? (
          <Muted>Names show once your gym approves you.</Muted>
        ) : null}
      </UIStack>
    </Field>
  );
}

/**
 * Class detail (spec S5) — title, discipline, day/time, duration, instructor,
 * capacity, and Book / Cancel. Enrolled tier, so a PENDING member may book too
 * (tagged "pending approval"). Booking is never blocked; at/over capacity the
 * count turns red and Book asks to confirm (shared `useBookClass`, v1.8 slice 1).
 * The primary action sits in a sticky bottom bar (thumb zone, slice 6); full info
 * scrolls above it. Booking here is now optional — the schedule row books inline.
 */
export default function ClassDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery(trpc.class.get.queryOptions({ id }, { retry: false }));
  // Same key as WhoIsIn, which renders below the `q.isPending` gate and so
  // would not start fetching until the class itself lands.
  useQuery(trpc.class.attendees.queryOptions({ id }));
  const current = useQuery(trpc.academy.current.queryOptions());
  const theme = useQuery(
    trpc.curriculum.forClass.queryOptions(
      { id },
      { enabled: isBjjAcademy(current.data?.type ?? "") },
    ),
  );

  const { onBook, isPending: booking, error: bookError } = useBookClass();
  const { onCancel, isPending: cancelling } = useCancelBooking();
  const busy = booking || cancelling;

  if (q.isPending) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Class" }} />
        <ClassDetailSkeleton />
      </Screen>
    );
  }

  if (q.isError) {
    return (
      <Screen center>
        <Stack.Screen options={{ title: "Class" }} />
        <ErrorState label="this class" onRetry={() => void q.refetch()} />
      </Screen>
    );
  }

  const c = q.data;
  const cancelled = c.status === "cancelled";
  const start = new Date(c.startsAt);
  const { label: capacityLabel, isOver: over } = capacityDisplay(
    c.bookingCount,
    c.capacity,
  );
  const booked = c.myBooking === "booked";
  const provisional = booked && c.myBookingTier === "provisional";
  const past = start.getTime() <= new Date().getTime();
  const bookable = canBook(
    { status: c.status, startsAt: start, deletedAt: null },
    new Date(),
  );
  const refusal =
    bookable.reason && bookable.reason !== "deleted"
      ? notBookableMessage(bookable.reason)
      : null;

  const action =
    booked && !cancelled && !past ? (
      <UIStack gap={8}>
        {provisional && (
          <Txt size={14} tone="brand">
            Booked · pending approval
          </Txt>
        )}
        <Button
          label={cancelling ? "Cancelling…" : "Cancel booking"}
          variant="destructive"
          loading={cancelling}
          disabled={busy}
          onPress={() => onCancel(c.id)}
        />
      </UIStack>
    ) : refusal ? (
      <Muted>{refusal}.</Muted>
    ) : (
      <Button
        label={booking ? "Booking…" : "Book"}
        loading={booking}
        disabled={busy}
        onPress={() => onBook(c)}
      />
    );

  return (
    <Screen>
      <Stack.Screen options={{ title: "Class" }} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <UIStack gap={24}>
          <UIStack gap={6}>
            <Heading>{c.title}</Heading>
            {c.discipline ? <Eyebrow>{c.discipline}</Eyebrow> : null}
            {c.description ? <Txt size={15}>{c.description}</Txt> : null}
          </UIStack>

          {cancelled && (
            <Banner tone="warning">This class is cancelled.</Banner>
          )}

          <UIStack gap={20}>
            <Field label="Day" value={dayLongFmt.format(start)} />
            <Field label="Time">
              <Txt size={16}>
                <Mono size={16} weight={600}>
                  {timeFmt.format(start)}
                </Mono>
                {` · ${c.durationMinutes} min`}
              </Txt>
            </Field>
            {/* "Nobody" rather than a dash: a general space runs sessions
                that nobody teaches, and the web says the same word. */}
            <Field label="Instructor" value={c.instructorName ?? "Nobody"} />
            {theme.data?.themes.length ? (
              <Field label="This week">
                {theme.data.themes.map((on) => (
                  <View key={on.theme}>
                    <Txt size={16}>{on.theme}</Txt>
                    {on.notes ? <Muted>{on.notes}</Muted> : null}
                    {on.run ? (
                      <View>
                        <Mono size={11} tone="brand">
                          THIS RUN
                        </Mono>
                        <Txt>{on.run}</Txt>
                      </View>
                    ) : null}
                  </View>
                ))}
              </Field>
            ) : null}
            <Field label="Capacity">
              <Mono size={16} tone={over ? "error" : "default"}>
                {capacityLabel}
                {over ? " · may be busy" : ""}
              </Mono>
            </Field>
            <WhoIsIn classId={c.id} viewerBooked={booked} />
          </UIStack>

          {bookError && (
            <Txt size={14} tone="error">
              {bookError}
            </Txt>
          )}
        </UIStack>
      </ScrollView>

      {/* Sticky bottom action bar — the primary action in the thumb zone. */}
      <View
        style={{ paddingTop: 16, borderTopWidth: 1, borderTopColor: t.border }}
      >
        {action}
      </View>
    </Screen>
  );
}
