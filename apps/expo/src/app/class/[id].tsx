import { ScrollView, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import {
  canBook,
  capacityDisplay,
  dayLongFmt,
  notBookableMessage,
  timeFmt,
} from "@matops/domain";

import { BookControl, useBooking } from "~/components/book-control";
import { ClassShare } from "~/components/class-share";
import { ClassDetailSkeleton, SkeletonCard } from "~/components/skeletons";
import {
  Card,
  EmptyState,
  ErrorState,
  Eyebrow,
  Heading,
  Muted,
  Screen,
  SectionHeading,
  Txt,
  Stack as UIStack,
  useTheme,
} from "~/components/ui";
import { useMinuteClock } from "~/components/use-clock";
import { trpc } from "~/utils/api";

function Detail({
  term,
  value,
  note,
  alert,
}: {
  term: string;
  value: string;
  note?: string;
  alert?: boolean;
}) {
  return (
    <View style={{ gap: 4 }}>
      <Eyebrow>{term}</Eyebrow>
      <Txt size={15} lineHeight={21}>
        {value}
        {note ? (
          <Txt size={12} tone={alert ? "error" : "muted"}>
            {`  ${note}`}
          </Txt>
        ) : null}
      </Txt>
    </View>
  );
}

function Attendees({ classId, booked }: { classId: string; booked: boolean }) {
  const view = useQuery(trpc.class.attendees.queryOptions({ id: classId }));

  if (view.isPending) return <SkeletonCard lines={2} />;
  if (view.isError) {
    return <ErrorState label="who's in" onRetry={() => void view.refetch()} />;
  }

  const { names, othersCount, namesHidden } = view.data;
  if (names.length === 0 && othersCount === 0) {
    return (
      <EmptyState title={booked ? "Just you so far" : "No bookings yet"} />
    );
  }

  return (
    <Card style={{ gap: 4 }}>
      {names.length > 0 ? <Txt size={15}>{names.join(", ")}</Txt> : null}
      {othersCount > 0 ? (
        <Muted>
          {names.length > 0
            ? `+${othersCount} ${othersCount === 1 ? "other" : "others"}`
            : `${othersCount} booked`}
        </Muted>
      ) : null}
      {namesHidden ? (
        <Muted>Names show once your gym approves you.</Muted>
      ) : null}
    </Card>
  );
}

export default function ClassDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery(trpc.class.get.queryOptions({ id }, { retry: false }));
  const academy = useQuery(trpc.academy.current.queryOptions());
  const booking = useBooking();
  const now = useMinuteClock();

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
  const start = new Date(c.startsAt);
  const cancelled = c.status === "cancelled";
  const booked = c.myBooking === "booked";
  const provisional = booked && c.myBookingTier === "provisional";
  const past = start.getTime() <= now.getTime();
  const windowDays = academy.data?.bookingWindowDays ?? 7;
  const bookable = canBook(
    { status: c.status, startsAt: start, deletedAt: null },
    now,
    {
      bookingWindowDays: windowDays,
      timeZone: academy.data?.timeZone ?? "UTC",
    },
  );
  const refusal =
    bookable.reason && bookable.reason !== "deleted"
      ? notBookableMessage(bookable.reason, windowDays)
      : null;
  const cap = capacityDisplay(c.bookingCount, c.capacity);
  const open = !cancelled && !past;

  return (
    <Screen>
      <Stack.Screen options={{ title: "Class" }} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: 32, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
      >
        <UIStack gap={4}>
          <Heading>{c.title}</Heading>
          <Muted>{`${dayLongFmt.format(start)} · ${timeFmt.format(start)}`}</Muted>
        </UIStack>

        <Card style={{ gap: 16 }}>
          <UIStack gap={4}>
            <Txt size={17} weight={600}>
              {cancelled
                ? "Class cancelled"
                : past
                  ? "Booking closed"
                  : booked
                    ? provisional
                      ? "Waiting for approval"
                      : "You're booked"
                    : "Book your place"}
            </Txt>
            <Muted>
              {cancelled
                ? "This class will not take place. Choose another session from the schedule."
                : past
                  ? `${refusal ?? "This class has started"}.`
                  : provisional
                    ? "Your booking is saved. Your gym still needs to approve it."
                    : booked
                      ? "Cancel your booking if your plans change."
                      : cap.isOver
                        ? "This class looks full. Your gym still allows bookings."
                        : `${cap.label} · ${c.durationMinutes} min`}
            </Muted>
          </UIStack>
          {open && (booked || bookable.ok) ? (
            <BookControl
              c={c}
              booked={booked}
              booking={booking}
              variant={cap.isOver ? "secondary" : "primary"}
            />
          ) : null}
          <ClassShare cls={c} />
          {open && !booked && booking.lockedMessage ? (
            <View
              accessibilityRole="text"
              style={{
                borderTopWidth: 1,
                borderTopColor: t.border,
                paddingTop: 16,
              }}
            >
              <Txt size={13}>{booking.lockedMessage}</Txt>
            </View>
          ) : null}
        </Card>

        <UIStack gap={16}>
          <SectionHeading>Class details</SectionHeading>
          <Card style={{ gap: 16 }}>
            <Detail
              term="Time"
              value={`${timeFmt.format(start)} · ${c.durationMinutes} min`}
            />
            <Detail term="Discipline" value={c.discipline ?? "Not specified"} />
            <Detail
              term="Instructor"
              value={c.instructorName ?? "Not assigned yet"}
            />
            <Detail
              term="Availability"
              value={cap.label}
              note={
                cap.isOver && bookable.ok ? "Bookings still allowed" : undefined
              }
              alert={cap.isOver}
            />
            {c.description ? (
              <Detail term="About this class" value={c.description} />
            ) : null}
          </Card>
        </UIStack>

        <UIStack gap={16}>
          <SectionHeading>Who&apos;s booked</SectionHeading>
          <Attendees classId={c.id} booked={booked && !cancelled} />
        </UIStack>
      </ScrollView>
    </Screen>
  );
}
