import { useState } from "react";
import { Alert } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Banner,
  Button,
  ErrorState,
  Eyebrow,
  Field,
  Heading,
  Loading,
  Mono,
  Muted,
  Screen,
  Txt,
  Stack as UIStack,
} from "~/components/ui";
import { trpc } from "~/utils/api";
import { dayLongFmt, timeFmt } from "~/utils/format";

/**
 * Class detail (spec S5) — title, discipline, day/time, duration, instructor,
 * capacity, and Book / Cancel (slice 3.1). Enrolled tier, so a PENDING member
 * may book too — tagged "pending approval". Booking is never blocked; at/over
 * capacity the count turns red and Book asks to confirm.
 */
export default function ClassDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const q = useQuery(trpc.class.get.queryOptions({ id }, { retry: false }));

  const refresh = () => queryClient.invalidateQueries(trpc.class.pathFilter());

  const book = useMutation(
    trpc.booking.book.mutationOptions({
      onSuccess: () => refresh(),
      onError: (err) => setError(err.message || "Could not book"),
    }),
  );
  const cancel = useMutation(
    trpc.booking.cancel.mutationOptions({
      onSuccess: () => refresh(),
      onError: (err) => setError(err.message || "Could not cancel"),
    }),
  );
  const busy = book.isPending || cancel.isPending;

  if (q.isPending) {
    return (
      <>
        <Stack.Screen options={{ title: "Class" }} />
        <Loading />
      </>
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
  const over = c.capacity > 0 && c.bookingCount >= c.capacity;
  const capacityLabel =
    c.capacity <= 0 ? "No limit" : `${c.bookingCount} / ${c.capacity}`;
  const booked = c.myBooking === "booked";
  const provisional = booked && c.myBookingTier === "provisional";
  const past = start.getTime() <= new Date().getTime();

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
    <Screen>
      <Stack.Screen options={{ title: "Class" }} />

      <UIStack gap={24}>
        <UIStack gap={6}>
          <Heading>{c.title}</Heading>
          {c.discipline ? <Eyebrow>{c.discipline}</Eyebrow> : null}
        </UIStack>

        {cancelled && <Banner tone="warning">This class is cancelled.</Banner>}

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
          <Field label="Instructor" value={c.instructorName ?? "—"} />
          <Field label="Capacity">
            <Mono size={16} tone={over ? "error" : "default"}>
              {capacityLabel}
              {over ? " · may be busy" : ""}
            </Mono>
          </Field>
        </UIStack>

        {error && (
          <Txt size={14} tone="error">
            {error}
          </Txt>
        )}

        {cancelled ? (
          <Muted>This class was cancelled — booking is closed.</Muted>
        ) : past ? (
          <Muted>This class has already started.</Muted>
        ) : booked ? (
          <UIStack gap={8}>
            {provisional && (
              <Txt size={14} tone="brand">
                Booked · pending approval
              </Txt>
            )}
            <Button
              label={cancel.isPending ? "Cancelling…" : "Cancel booking"}
              variant="outline"
              disabled={busy}
              onPress={() => {
                setError(null);
                cancel.mutate({ classId: c.id });
              }}
            />
          </UIStack>
        ) : (
          <Button
            label={book.isPending ? "Booking…" : "Book"}
            disabled={busy}
            onPress={onBook}
          />
        )}
      </UIStack>
    </Screen>
  );
}
