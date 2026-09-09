import { useState } from "react";
import { Alert, Pressable } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";

import { BOOKING_LOCKED, capacityDisplay } from "@matops/domain";
import { useInvalidate } from "@matops/ui/use-invalidate";

import { useToast } from "~/components/toast";
import { confirm, Txt, useTheme } from "~/components/ui";
import { trpc } from "~/utils/api";
import { dayFmt, timeFmt } from "~/utils/format";
import { cancelClassReminder, scheduleClassReminder } from "~/utils/reminders";

/**
 * The minimum a class needs to be booked from any surface (schedule row, hero
 * card, detail). A superset of what `booking.book` reads plus the soft-capacity
 * fields (to decide the confirm) and the start time (for the confirmation toast).
 */
export interface BookableClass {
  id: string;
  title: string;
  capacity: number;
  bookingCount: number;
  startsAt: string | Date;
}

/**
 * Shared booking action (v1.8 slice 1): call `booking.book`, and when the class
 * looks full ask "Book anyway?" first — soft capacity, never blocked.
 *
 * A hook, not a component, so callers own their own pending / error state: a
 * list of rows each gets an independent control without a shared spinner.
 */
export function useBookClass(
  onBooked?: () => void,
  opts?: { toastError?: boolean },
) {
  const invalidateFor = useInvalidate();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);

  const current = useQuery(trpc.academy.current.queryOptions());
  const approved = current.data?.status === "active";
  // One question, one answer, whichever gate this branch runs on. The server
  // builds the sentence through the same `bookingGate` the booking mutation
  // uses, so the app and the web show the identical words for the identical
  // situation (ADR 126). Cancel is never gated: somebody whose month ran out
  // must still be able to give their place back.
  const gate = useQuery(
    trpc.booking.access.queryOptions(undefined, {
      enabled: approved,
    }),
  );

  const book = useMutation(
    trpc.booking.book.mutationOptions({
      onSuccess: async () => {
        setError(null);
        await invalidateFor("booking");
        onBooked?.();
      },
      onError: (err) => {
        const message = err.message || "Couldn't book that class. Try again.";
        setError(message);
        // The inline schedule pill has no room to show the error text, so it
        // opts into a toast; the detail screen renders `error` inline instead.
        if (opts?.toastError) toast.show(message);
      },
    }),
  );
  /** Send the booking; a per-call success toast names the class (slice 6). */
  const doBook = (c: BookableClass) => {
    const start = new Date(c.startsAt);
    const label = `Booked for ${dayFmt.format(start)} · ${timeFmt.format(start)}`;
    const options = {
      onSuccess: () => {
        toast.show(label);
        void scheduleClassReminder(c);
      },
    };
    book.mutate({ classId: c.id }, options);
  };

  /** Book `c`, asking to confirm first when it is at/over capacity. */
  const onBook = (c: BookableClass) => {
    setError(null);
    if (gate.data?.locked) {
      const message = gate.data.message ?? BOOKING_LOCKED;
      setError(message);
      if (opts?.toastError) toast.show(message);
      return;
    }
    const over = capacityDisplay(c.bookingCount, c.capacity).isOver;
    if (over) {
      Alert.alert("This class looks full", "Book anyway?", [
        { text: "Cancel", style: "cancel" },
        { text: "Book anyway", onPress: () => doBook(c) },
      ]);
    } else {
      doBook(c);
    }
  };

  return {
    onBook,
    isPending: book.isPending,
    error,
  };
}

/**
 * Shared cancel action: confirm, then drop the local reminder and refresh every
 * list that shows the class.
 */
export function useCancelBooking() {
  const invalidateFor = useInvalidate();
  const toast = useToast();

  const cancel = useMutation(
    trpc.booking.cancel.mutationOptions({
      onSuccess: async (_data, variables) => {
        toast.show("Booking cancelled");
        void cancelClassReminder(variables.classId);
        await invalidateFor("booking");
      },
      onError: (err) =>
        toast.show(err.message || "Couldn't cancel that booking. Try again."),
    }),
  );
  const onCancel = (classId: string) =>
    confirm({
      title: "Cancel this booking?",
      message:
        "You'll lose your spot. If the class is full, you may not get it back.",
      confirmLabel: "Cancel booking",
      cancelLabel: "Keep it",
      onConfirm: () => cancel.mutate({ classId }),
    });

  return {
    onCancel,
    isPending: cancel.isPending,
    pendingClassId: cancel.isPending ? cancel.variables.classId : null,
  };
}

/**
 * A compact **Book** pill for a schedule row (slice 1). Booking is one tap here
 * (plus the capacity confirm when over) — the detail screen is no longer required
 * to book. Renders nothing extra for booked / cancelled / past rows; the caller
 * decides when to show it.
 */
export function BookButton({ c }: { c: BookableClass }) {
  const t = useTheme();
  const { onBook, isPending } = useBookClass(undefined, {
    toastError: true,
  });
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Book class"
      accessibilityState={{ disabled: isPending, busy: isPending }}
      disabled={isPending}
      onPress={() => onBook(c)}
      hitSlop={10}
      style={({ pressed }) => ({
        minHeight: 36,
        minWidth: 64,
        paddingHorizontal: 16,
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

/**
 * The compact **Cancel** pill for a booked schedule row — the twin of
 * `BookButton`, so a student drops a class without opening the detail.
 */
export function CancelButton({ classId }: { classId: string }) {
  const t = useTheme();
  const { onCancel, isPending } = useCancelBooking();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Cancel booking"
      accessibilityState={{ disabled: isPending, busy: isPending }}
      disabled={isPending}
      onPress={() => onCancel(classId)}
      hitSlop={10}
      style={({ pressed }) => ({
        minHeight: 36,
        minWidth: 64,
        paddingHorizontal: 14,
        borderRadius: 3,
        borderWidth: 1,
        borderColor: t.error,
        alignItems: "center",
        justifyContent: "center",
        opacity: isPending ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <Txt size={14} weight={600} tone="error">
        {isPending ? "…" : "Cancel"}
      </Txt>
    </Pressable>
  );
}
