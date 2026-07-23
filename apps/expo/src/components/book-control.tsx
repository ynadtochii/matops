import { useState } from "react";
import { Alert, Pressable } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useToast } from "~/components/toast";
import { Txt, useTheme } from "~/components/ui";
import { trpc } from "~/utils/api";
import { dayFmt, timeFmt } from "~/utils/format";

/**
 * The minimum a class needs to be booked from any surface (schedule row, hero
 * card, detail). A superset of what `booking.book` reads plus the soft-capacity
 * fields (to decide the confirm) and the start time (for the confirmation toast).
 */
export interface BookableClass {
  id: string;
  capacity: number;
  bookingCount: number;
  startsAt: string | Date;
}

/**
 * Shared booking action (v1.8 slice 1). One place for the rule that lived twice
 * (the schedule hero card + the class detail): call `booking.book`, and when the
 * class looks full ask **"Book anyway?"** first — soft capacity, never blocked.
 * On success it invalidates the class + booking caches so every list reflects the
 * new booking, then runs the optional `onBooked` (used for the slice-6 toast).
 *
 * Kept as a hook so callers own their own pending / error state — a list of rows
 * each gets an independent control without a shared spinner.
 */
export function useBookClass(onBooked?: () => void) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);

  const book = useMutation(
    trpc.booking.book.mutationOptions({
      onSuccess: async () => {
        setError(null);
        await queryClient.invalidateQueries(trpc.class.pathFilter());
        await queryClient.invalidateQueries(trpc.booking.pathFilter());
        onBooked?.();
      },
      onError: (err) => setError(err.message || "Could not book"),
    }),
  );

  /** Send the booking; a per-call success toast names the class (slice 6). */
  const doBook = (c: BookableClass) => {
    const start = new Date(c.startsAt);
    const label = `Booked — ${dayFmt.format(start)} · ${timeFmt.format(start)}`;
    book.mutate({ classId: c.id }, { onSuccess: () => toast.show(label) });
  };

  /** Book `c`, asking to confirm first when it is at/over capacity. */
  const onBook = (c: BookableClass) => {
    setError(null);
    const over = c.capacity > 0 && c.bookingCount >= c.capacity;
    if (over) {
      Alert.alert("This class looks full", "Book anyway?", [
        { text: "Cancel", style: "cancel" },
        { text: "Book anyway", onPress: () => doBook(c) },
      ]);
    } else {
      doBook(c);
    }
  };

  return { onBook, isPending: book.isPending, error };
}

/**
 * A compact **Book** pill for a schedule row (slice 1). Booking is one tap here
 * (plus the capacity confirm when over) — the detail screen is no longer required
 * to book. Renders nothing extra for booked / cancelled / past rows; the caller
 * decides when to show it.
 */
export function BookButton({ c }: { c: BookableClass }) {
  const t = useTheme();
  const { onBook, isPending } = useBookClass();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isPending}
      onPress={() => onBook(c)}
      hitSlop={6}
      style={({ pressed }) => ({
        minHeight: 36,
        paddingHorizontal: 14,
        borderRadius: 3,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: t.primary,
        opacity: isPending ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <Txt size={14} weight={600} color={t.primaryForeground}>
        {isPending ? "…" : "Book"}
      </Txt>
    </Pressable>
  );
}
