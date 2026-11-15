"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import {
  formatDay,
  formatMoney,
  nextPeriod,
  paymentDayLabel,
  periodLastDay,
  periodsFrom,
  upfrontTotal,
} from "@matops/domain";
import { Button } from "@matops/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@matops/ui/dialog";
import { FieldError } from "@matops/ui/field";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Select } from "@matops/ui/select";
import { Textarea } from "@matops/ui/textarea";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";
import { useOrganization } from "../entity";

type Claim = RouterOutputs["accessPlan"]["claims"][number];

export function ConfirmClaimDialog({
  claim,
  onOpenChange,
}: {
  claim: Claim;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const owner = useOrganization().role === "owner";
  const defaults = claim.confirm;
  const [startsOn, setStartsOn] = useState(defaults.startsOn);
  const [months, setMonths] = useState(defaults.months);
  const [total, setTotal] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const confirm = useMutation(
    trpc.accessPlan.confirmClaim.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.accessPlan.pathFilter());
        await queryClient.invalidateQueries(
          trpc.stats.navigationSummary.pathFilter(),
        );
        toast.success("Payment confirmed");
        onOpenChange(false);
      },
      onError: (e) => setError(e.message || "Couldn't confirm that."),
    }),
  );

  const startValid =
    !defaults.startEditable ||
    (/^\d{4}-\d{2}-\d{2}$/.test(startsOn) &&
      startsOn >= defaults.startMin &&
      startsOn <= defaults.startMax);
  const schedule = defaults.startEditable
    ? {
        ...defaults.schedule,
        startMonth: startsOn,
        periodAnchor: null,
        periodAnchorFrom: null,
      }
    : defaults.schedule;
  const first = defaults.startEditable ? startsOn : claim.month;
  const last = startValid ? periodsFrom(first, schedule, months).at(-1) : null;
  const expected =
    months === defaults.months
      ? defaults.totalMinor
      : defaults.monthlyMinor !== null
        ? upfrontTotal(defaults.monthlyMinor, defaults.rule, months).totalMinor
        : null;
  const currency = defaults.currency ?? "EUR";

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>
          Confirm payment for {claim.name}, {claim.planName}
        </DialogTitle>
        {!owner && (
          <p className="text-muted-foreground text-sm">
            Only the owner can change the start day or months.
          </p>
        )}
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!startValid) {
              setError(
                `Pick a start day from ${formatDay(defaults.startMin)} to ${formatDay(defaults.startMax)}.`,
              );
              return;
            }
            const custom = total.trim()
              ? Math.round(Number(total.replace(",", ".")) * 100)
              : undefined;
            if (custom !== undefined && !(custom >= 0)) {
              setError("Give the total as a number, like 135 or 135.50.");
              return;
            }
            setError(null);
            confirm.mutate({
              assignmentId: claim.assignmentId,
              month: claim.month,
              expectedVersion: claim.version,
              ...(defaults.startEditable && startsOn !== defaults.startsOn
                ? { startsOn }
                : {}),
              ...(months !== defaults.months ? { months } : {}),
              ...(custom !== undefined ? { totalMinor: custom } : {}),
              ...(reason.trim() ? { reason: reason.trim() } : {}),
            });
          }}
        >
          {defaults.startEditable && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="claim-starts-on">Starts on</Label>
              <Input
                id="claim-starts-on"
                type="date"
                className="w-44"
                value={startsOn}
                min={defaults.startMin}
                max={defaults.startMax}
                disabled={!owner}
                onChange={(e) => setStartsOn(e.target.value)}
              />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="claim-months">Months</Label>
            <Select
              id="claim-months"
              className="w-32"
              value={String(months)}
              disabled={!owner}
              onChange={(e) => setMonths(Number(e.target.value))}
            >
              {Array.from({ length: defaults.maxMonths }, (_, i) => i + 1).map(
                (n) => (
                  <option key={n} value={n}>
                    {n === 1 ? "1 month" : `${n} months`}
                  </option>
                ),
              )}
            </Select>
          </div>
          {last && (
            <p className="bg-surface-1 rounded-md p-3 text-sm">
              Covers {formatDay(first)} to{" "}
              {formatDay(periodLastDay(last, schedule))}. Next payment{" "}
              {formatDay(nextPeriod(last, schedule))}, then on{" "}
              {paymentDayLabel(first)} of each month.
              {expected !== null && (
                <>
                  {" "}
                  Total{" "}
                  <span className="font-semibold tabular-nums">
                    {formatMoney(expected, currency)}
                  </span>
                  .
                </>
              )}
            </p>
          )}
          {owner && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="claim-total">
                Different total{" "}
                <span className="text-muted-foreground font-normal">
                  (optional)
                </span>
              </Label>
              <Input
                id="claim-total"
                inputMode="decimal"
                className="w-36"
                placeholder={
                  expected !== null ? (expected / 100).toFixed(2) : undefined
                }
                value={total}
                onChange={(e) => setTotal(e.target.value)}
              />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="claim-reason">
              Note{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Textarea
              id="claim-reason"
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {error && <FieldError>{error}</FieldError>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" busy={confirm.isPending}>
              {claim.cashPaidToName ? "Cash received" : "Confirm"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
