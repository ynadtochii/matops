"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import { isActiveMember, isStaff } from "@matops/domain";
import { toast } from "@matops/ui/toast";

import { useInvalidate } from "~/trpc/invalidate";
import { useTRPC } from "~/trpc/react";
import { useEntity } from "./entity";

/**
 * Book and cancel, for every screen that offers them (the student schedule,
 * class detail, My classes). One place decides what a booking invalidates:
 * `class` for the spots-left counts and `booking` for the student's own list.
 * Splitting that per screen is how one of them went stale. Mirrors
 * `apps/expo/src/components/book-control.tsx`.
 */
export function useBooking() {
  const trpc = useTRPC();
  const invalidateFor = useInvalidate();
  const academy = useEntity();

  // One question, one answer, whichever gate this branch runs on. The server
  // builds the sentence through the same `bookingGate` the booking mutation
  // uses, so the screen and the write cannot disagree, and the app shows the
  // identical words (ADR 126). Cancel is never gated: somebody whose month ran
  // out must still be able to give their place back.
  const gate = useQuery({
    ...trpc.booking.access.queryOptions(),
    enabled: !isStaff(academy),
    refetchInterval: (query) => (query.state.data?.locked ? 10000 : false),
  });
  const lockedMessage = !isActiveMember(academy)
    ? "Your gym has not approved you yet. You can browse classes while you wait."
    : !isStaff(academy) && gate.isPending
      ? "Checking your booking access…"
      : gate.isError
        ? "Could not check booking access. Refresh this page to try again."
        : gate.data?.locked
          ? gate.data.message
          : null;

  const invalidate = () => invalidateFor("booking");
  const onError = (err: { message: string }) =>
    toast.error(err.message || "Could not update your booking");

  const book = useMutation(
    trpc.booking.book.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Booked");
      },
      onError,
    }),
  );
  const cancel = useMutation(
    trpc.booking.cancel.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Booking cancelled");
      },
      onError,
    }),
  );

  /** Is a booking call in flight for this class? Disables just that row. */
  const busyFor = (classId: string) =>
    (book.isPending && book.variables.classId === classId) ||
    (cancel.isPending && cancel.variables.classId === classId);

  return {
    book,
    cancel,
    busyFor,
    busy: book.isPending || cancel.isPending,
    lockedMessage,
  };
}
