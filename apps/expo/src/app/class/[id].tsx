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
  Stack as UIStack,
  useTheme,
} from "~/components/ui";
import { trpc } from "~/utils/api";
import { dayLongFmt, timeFmt } from "~/utils/format";

/** One labelled fact row on the detail screen. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 4 }}>
      <Text
        style={{
          fontSize: 12,
          fontWeight: "600",
          textTransform: "uppercase",
          color: t.mutedForeground,
        }}
      >
        {label}
      </Text>
      <Text style={{ fontSize: 16, color: t.foreground }}>{children}</Text>
    </View>
  );
}

/**
 * Class detail (spec S5) — title, discipline, day/time, duration, instructor,
 * capacity, and Book / Cancel (slice 3.1). Enrolled tier, so a PENDING member
 * may book too — tagged "pending approval". Booking is never blocked; at/over
 * capacity the count turns red and Book asks to confirm.
 */
export default function ClassDetail() {
  const t = useTheme();
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
          {c.discipline && (
            <Text
              style={{ fontSize: 12, textTransform: "uppercase", color: t.mutedForeground }}
            >
              {c.discipline}
            </Text>
          )}
        </UIStack>

        {cancelled && <Banner tone="warning">This class is cancelled.</Banner>}

        <UIStack gap={20}>
          <Field label="Day">{dayLongFmt.format(start)}</Field>
          <Field label="Time">
            {timeFmt.format(start)} · {c.durationMinutes} min
          </Field>
          <Field label="Instructor">{c.instructorName ?? "—"}</Field>
          <View style={{ gap: 4 }}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                textTransform: "uppercase",
                color: t.mutedForeground,
              }}
            >
              Capacity
            </Text>
            <Text
              style={{ fontSize: 16, color: over ? t.destructive : t.foreground }}
            >
              {capacityLabel}
              {over ? " · may be busy" : ""}
            </Text>
          </View>
        </UIStack>

        {error && (
          <Text style={{ fontSize: 14, color: t.destructive }}>{error}</Text>
        )}

        {cancelled ? (
          <Muted>This class was cancelled — booking is closed.</Muted>
        ) : past ? (
          <Muted>This class has already started.</Muted>
        ) : booked ? (
          <UIStack gap={8}>
            {provisional && (
              <Text style={{ fontSize: 14, color: t.brandStrong }}>
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
