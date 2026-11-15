"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { addDays, formatDay, paymentDayLabel } from "@matops/domain";
import { Button } from "@matops/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@matops/ui/dialog";
import { FieldError } from "@matops/ui/field";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Textarea } from "@matops/ui/textarea";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";

export function PaymentDateDialog({
  held,
  onOpenChange,
}: {
  held: {
    id: string;
    planName: string;
    month: string;
    nextPaymentOn: string;
  };
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(held.nextPaymentOn);
  const [error, setError] = useState<string | null>(null);
  const change = useMutation(
    trpc.accessPlan.changePaymentDate.mutationOptions({
      onSuccess: async (done) => {
        await queryClient.invalidateQueries(trpc.accessPlan.pathFilter());
        toast.success(`They now pay on ${done.paymentDayLabel}`);
        onOpenChange(false);
      },
      onError: (e) => setError(e.message || "Couldn't change the date."),
    }),
  );
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(date) && date > held.month;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Change payment date for {held.planName}</DialogTitle>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) {
              setError("Pick a date after the current period starts.");
              return;
            }
            setError(null);
            change.mutate({ assignmentId: held.id, nextPaymentOn: date });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="next-payment-on">Next payment</Label>
            <Input
              id="next-payment-on"
              type="date"
              className="w-44"
              value={date}
              min={addDays(held.month, 1)}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          {valid && (
            <p className="bg-surface-1 rounded-md p-3 text-sm">
              This period runs {formatDay(held.month)} to{" "}
              {formatDay(addDays(date, -1))}. From {formatDay(date)} they pay on{" "}
              {paymentDayLabel(date)} of each month.
            </p>
          )}
          {error && <FieldError>{error}</FieldError>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" busy={change.isPending}>
              Change date
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DueDateDialog({
  held,
  onOpenChange,
}: {
  held: {
    id: string;
    planName: string;
    month: string;
    periodLabel: string;
    deadlineOn: string;
    deadlineMoved: boolean;
  };
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(held.deadlineOn);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = useMutation(
    trpc.accessPlan.setDueDate.mutationOptions({
      onSuccess: async (done) => {
        await queryClient.invalidateQueries(trpc.accessPlan.pathFilter());
        toast.success(`Booking now stops on ${done.deadlineLabel}`);
        onOpenChange(false);
      },
      onError: (e) => setError(e.message || "Couldn't change the date."),
    }),
  );
  const submit = (stopsOn: string | null) => {
    setError(null);
    save.mutate({
      assignmentId: held.id,
      month: held.month,
      stopsOn,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    });
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Change due date for {held.planName}</DialogTitle>
        <p className="text-muted-foreground text-sm">
          {held.periodLabel}. If it is still unpaid, booking stops at the start
          of this day.
        </p>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
              setError("Pick a date.");
              return;
            }
            submit(date);
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="stops-on">Booking stops on</Label>
            <Input
              id="stops-on"
              type="date"
              className="w-44"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="stops-on-reason">
              Reason{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Textarea
              id="stops-on-reason"
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {error && <FieldError>{error}</FieldError>}
          <div className="flex flex-wrap justify-end gap-2">
            {held.deadlineMoved && (
              <Button
                type="button"
                variant="outline"
                busy={save.isPending && save.variables.stopsOn === null}
                onClick={() => submit(null)}
              >
                Reset to usual date
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              busy={save.isPending && save.variables.stopsOn !== null}
            >
              Save date
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
