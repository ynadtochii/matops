import type { ReactNode } from "react";
import { useState } from "react";
import { Alert, Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Banner,
  Button,
  ErrorState,
  Heading,
  Loading,
  Muted,
  Screen,
} from "~/components/ui";
import { trpc } from "~/utils/api";
import { dayLongFmt, timeFmt } from "~/utils/format";

/** One labelled fact row on the detail screen. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="gap-1">
      <Text className="text-muted-foreground text-xs font-semibold uppercase">
        {label}
      </Text>
      <Text className="text-foreground text-base">{children}</Text>
    </View>
  );
}

/**
 * Class detail (spec S5) — title, discipline, day/time, duration, instructor,
 * capacity, and Book / Cancel (slice 3.1). Enrolled tier, so a PENDING member
 * may book too — their booking is tagged "pending approval". Booking is never
 * blocked; at/over capacity the count turns red and Book asks to confirm.
 */
export default function ClassDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const q = useQuery(trpc.class.get.queryOptions({ id }, { retry: false }));

  // Refresh the detail + the schedule ("Booked" pills / counts) after a change.
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
      <Screen className="justify-center">
        <Stack.Screen options={{ title: "Class" }} />
        <ErrorState label="this class" onRetry={() => void q.refetch()} />
      </Screen>
    );
  }

  const c = q.data;
  const cancelled = c.status === "cancelled";
  const start = new Date(c.startsAt);
  // At/over capacity is red (spec S5/§4) — booking still never blocked.
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
    <Screen className="gap-6">
      <Stack.Screen options={{ title: "Class" }} />

      <View className="gap-2">
        <Heading>{c.title}</Heading>
        {c.discipline && (
          <Text className="text-muted-foreground text-xs uppercase">
            {c.discipline}
          </Text>
        )}
      </View>

      {cancelled && <Banner tone="warning">This class is cancelled.</Banner>}

      <View className="gap-5">
        <Field label="Day">{dayLongFmt.format(start)}</Field>
        <Field label="Time">
          {timeFmt.format(start)} · {c.durationMinutes} min
        </Field>
        <Field label="Instructor">{c.instructorName ?? "—"}</Field>
        <View className="gap-1">
          <Text className="text-muted-foreground text-xs font-semibold uppercase">
            Capacity
          </Text>
          <Text
            className={`text-base ${over ? "text-destructive" : "text-foreground"}`}
          >
            {capacityLabel}
            {over ? " · may be busy" : ""}
          </Text>
        </View>
      </View>

      {error && <Text className="text-destructive text-sm">{error}</Text>}

      {cancelled ? (
        <Muted>This class was cancelled — booking is closed.</Muted>
      ) : past ? (
        <Muted>This class has already started.</Muted>
      ) : booked ? (
        <View className="gap-2">
          {provisional && (
            <Text className="text-muted-foreground text-sm">
              Booked · pending approval
            </Text>
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
        </View>
      ) : (
        <Button
          label={book.isPending ? "Booking…" : "Book"}
          disabled={busy}
          onPress={onBook}
        />
      )}
    </Screen>
  );
}
