"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@matops/ui/button";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";
import { SectionHeading } from "./primitives";

/**
 * Booking rule (spec O6, ADR 82) — whether a student needs an active
 * membership to book, and how many grace days a new or overdue member keeps.
 * Owner-only.
 */
export function BookingGate() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const req = useQuery(trpc.payments.getRequisites.queryOptions());
  const [draft, setDraft] = useState<{
    enforced: boolean;
    graceDays: number;
  } | null>(null);

  const save = useMutation(
    trpc.payments.updateBookingGate.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.payments.pathFilter());
        setDraft(null);
        toast.success("Booking rule saved");
      },
      onError: (err) => toast.error(err.message || "Could not save"),
    }),
  );

  if (req.isPending || req.isError) return null;

  const current = {
    enforced: req.data.enforced,
    graceDays: req.data.graceDays,
  };
  const shown = draft ?? current;
  const dirty =
    shown.enforced !== current.enforced ||
    shown.graceDays !== current.graceDays;
  const graceValid =
    Number.isInteger(shown.graceDays) &&
    shown.graceDays >= 0 &&
    shown.graceDays <= 30;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <SectionHeading>Booking rule</SectionHeading>
        <p className="text-muted-foreground text-sm">
          When on, students need an active membership to book a class. A new or
          overdue member keeps booking through the grace period below, with a
          warning that names the lock date. Booking never locks the door: the
          gym QR check-in always works.
        </p>
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm sm:min-h-9">
        <input
          type="checkbox"
          className="accent-brand size-4"
          checked={shown.enforced}
          onChange={(e) => setDraft({ ...shown, enforced: e.target.checked })}
        />
        Members need an active membership to book
      </label>
      <div className="flex max-w-48 flex-col gap-1.5">
        <Label htmlFor="grace-days">Grace period (days)</Label>
        <Input
          id="grace-days"
          type="number"
          min={0}
          max={30}
          value={Number.isNaN(shown.graceDays) ? "" : shown.graceDays}
          disabled={!shown.enforced}
          onChange={(e) =>
            setDraft({ ...shown, graceDays: e.target.valueAsNumber })
          }
        />
      </div>
      {dirty && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={save.isPending || !graceValid}
            onClick={() =>
              save.mutate({
                enforced: shown.enforced,
                graceDays: shown.graceDays,
              })
            }
          >
            {save.isPending ? "Saving…" : "Save booking rule"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={save.isPending}
            onClick={() => setDraft(null)}
          >
            Cancel
          </Button>
        </div>
      )}
    </section>
  );
}
