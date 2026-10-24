import { Alert } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";

import {
  accessReason,
  capacityDisplay,
  dayShortFmt,
  isActiveMember,
  timeFmt,
} from "@matops/domain";
import { useInvalidate } from "@matops/ui/use-invalidate";

import { useToast } from "~/components/toast";
import { Button } from "~/components/ui";
import { trpc } from "~/utils/api";
import { cancelClassReminder, scheduleClassReminder } from "~/utils/reminders";

export interface BookableClass {
  id: string;
  title: string;
  capacity: number;
  bookingCount: number;
  startsAt: string | Date;
}

export function useBooking() {
  const invalidateFor = useInvalidate();
  const toast = useToast();
  const current = useQuery(trpc.academy.current.queryOptions());
  const academy = current.data;

  // With payment off the server gate only asks for approval, which the status already answers.
  const active = !!academy && isActiveMember(academy);
  const needsGate = active && academy.membershipEnforced;
  const gate = useQuery(
    trpc.booking.access.queryOptions(undefined, {
      enabled: needsGate,
      refetchInterval: (query) => (query.state.data?.locked ? 10000 : false),
    }),
  );
  const lockedMessage =
    academy && !active
      ? accessReason("pending-approval", academy.name)
      : !needsGate
        ? null
        : gate.isError
          ? "Couldn't check your booking access. Pull down to try again."
          : gate.data?.locked
            ? (gate.data.message ?? null)
            : null;
  const locked = !academy || !!lockedMessage || (needsGate && gate.isPending);

  const onError = (err: { message: string }) =>
    toast.show(err.message || "Couldn't update your booking. Try again.");

  const bookMutation = useMutation(
    trpc.booking.book.mutationOptions({
      onSuccess: () => invalidateFor("booking"),
      onError,
    }),
  );
  const cancelMutation = useMutation(
    trpc.booking.cancel.mutationOptions({
      onSuccess: async (_data, variables) => {
        toast.show("Booking cancelled");
        void cancelClassReminder(variables.classId);
        await invalidateFor("booking");
      },
      onError,
    }),
  );

  const send = (c: BookableClass) => {
    const start = new Date(c.startsAt);
    bookMutation.mutate(
      { classId: c.id },
      {
        onSuccess: () => {
          toast.show(
            `Booked for ${dayShortFmt.format(start)} · ${timeFmt.format(start)}`,
          );
          void scheduleClassReminder(c);
        },
      },
    );
  };

  const book = (c: BookableClass) => {
    if (locked) return;
    if (!capacityDisplay(c.bookingCount, c.capacity).isOver) return send(c);
    Alert.alert(
      "This class looks full",
      "Your gym decides the real limit, so you can still book. Ask them if you are not sure.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Book anyway", onPress: () => send(c) },
      ],
    );
  };

  const cancel = (classId: string) => cancelMutation.mutate({ classId });

  const busyFor = (classId: string) =>
    (bookMutation.isPending && bookMutation.variables.classId === classId) ||
    (cancelMutation.isPending && cancelMutation.variables.classId === classId);

  return { book, cancel, busyFor, locked, lockedMessage };
}

export type Booking = ReturnType<typeof useBooking>;

export function BookControl({
  c,
  booked,
  booking,
  variant = "secondary",
}: {
  c: BookableClass;
  booked: boolean;
  booking: Booking;
  variant?: "primary" | "secondary";
}) {
  const at = timeFmt.format(new Date(c.startsAt));
  const busy = booking.busyFor(c.id);
  if (booked) {
    return (
      <Button
        label="Cancel booking"
        variant="outline"
        loading={busy}
        accessibilityLabel={`Cancel booking for ${c.title} at ${at}`}
        onPress={() => booking.cancel(c.id)}
      />
    );
  }
  return (
    <Button
      label="Book class"
      variant={variant}
      loading={busy}
      disabled={booking.locked}
      accessibilityLabel={`Book ${c.title} at ${at}`}
      onPress={() => booking.book(c)}
    />
  );
}
