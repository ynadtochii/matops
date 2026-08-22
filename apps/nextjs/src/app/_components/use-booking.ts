"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";

/**
 * Book and cancel, for every screen that offers them (the student schedule,
 * class detail, My classes). One place decides what a booking invalidates:
 * `class` for the spots-left counts and `booking` for the student's own list.
 * Splitting that per screen is how one of them went stale. Mirrors
 * `apps/expo/src/components/book-control.tsx`.
 */
export function useBooking() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const invalidate = async () => {
    await queryClient.invalidateQueries(trpc.class.pathFilter());
    await queryClient.invalidateQueries(trpc.booking.pathFilter());
  };
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

  return { book, cancel, busyFor, busy: book.isPending || cancel.isPending };
}
