"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import {
  formatMoney,
  MAX_UPFRONT_MONTHS,
  upfrontRuleLabel,
  upfrontTotal,
} from "@matops/domain";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@matops/ui/dialog";
import { FieldError } from "@matops/ui/field";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Select } from "@matops/ui/select";
import { Textarea } from "@matops/ui/textarea";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";
import { useOrganization } from "./entity";

type Held = RouterOutputs["accessPlan"]["forUser"][number];
type Plan = RouterOutputs["accessPlan"]["list"][number];

export function RecordMonthsDialog({
  held,
  plan,
  onOpenChange,
}: {
  held: Held;
  plan: Plan | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const owner = useOrganization().role === "owner";
  const methods = useQuery(trpc.paymentMethod.list.queryOptions());
  const currency = plan?.currentAmount?.currency ?? plan?.currency ?? "EUR";
  const monthly = plan?.currentAmount?.priceMinor ?? plan?.priceMinor ?? 0;
  const [months, setMonths] = useState("3");
  const [methodId, setMethodId] = useState("");
  const [total, setTotal] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const count = Number(months);
  const valid =
    Number.isInteger(count) && count >= 1 && count <= MAX_UPFRONT_MONTHS;
  const quote = valid
    ? upfrontTotal(monthly, plan?.discount ?? null, count)
    : null;

  const record = useMutation(
    trpc.accessPlan.recordPurchase.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.accessPlan.pathFilter());
        toast.success("Months recorded as paid");
        onOpenChange(false);
      },
      onError: (e) => toast.error(e.message || "Couldn't record that."),
    }),
  );

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Record months paid for {held.planName}</DialogTitle>
        <p className="text-muted-foreground text-sm">
          The months start after the last month already paid or waiting for a
          check.
          {plan?.discount
            ? ` ${upfrontRuleLabel(plan.discount, currency)}.`
            : ""}
        </p>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) {
              setError(`Pick 1 to ${MAX_UPFRONT_MONTHS} months.`);
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
            record.mutate({
              assignmentId: held.id,
              months: count,
              ...(custom !== undefined ? { totalMinor: custom } : {}),
              ...(methodId ? { methodId } : {}),
              ...(note.trim() ? { note: note.trim() } : {}),
            });
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="record-months">Months</Label>
            <Input
              id="record-months"
              inputMode="numeric"
              className="w-24"
              value={months}
              onChange={(e) => setMonths(e.target.value)}
            />
          </div>
          {quote && (
            <p className="bg-surface-1 rounded-md p-3 text-sm">
              Total{" "}
              <span className="font-semibold tabular-nums">
                {formatMoney(quote.totalMinor, currency)}
              </span>
              {quote.savingMinor > 0 &&
                `, ${formatMoney(quote.savingMinor, currency)} off`}
              .
            </p>
          )}
          {owner && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="record-total">
                Different total{" "}
                <span className="text-muted-foreground font-normal">
                  (optional, owner only)
                </span>
              </Label>
              <Input
                id="record-total"
                inputMode="decimal"
                className="w-36"
                placeholder={
                  quote ? (quote.totalMinor / 100).toFixed(2) : undefined
                }
                value={total}
                onChange={(e) => setTotal(e.target.value)}
              />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="record-method">How they paid</Label>
            <Select
              id="record-method"
              value={methodId}
              onChange={(e) => setMethodId(e.target.value)}
            >
              <option value="">Not recorded</option>
              {(methods.data ?? []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="record-note">
              Note{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </Label>
            <Textarea
              id="record-note"
              rows={2}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
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
            <Button type="submit" busy={record.isPending}>
              Record as paid
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PurchaseList({ held }: { held: Held }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const owner = useOrganization().role === "owner";
  const discard = useMutation(
    trpc.accessPlan.discardPurchase.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries(trpc.accessPlan.pathFilter());
        toast.success(
          result.dropped === 1
            ? "1 month removed"
            : `${result.dropped} months removed`,
        );
      },
      onError: (e) => toast.error(e.message || "Couldn't discard that."),
    }),
  );
  if (held.purchases.length === 0) return null;

  return (
    <ul className="flex flex-col gap-1">
      {held.purchases.map((p) => (
        <li
          key={p.id}
          className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs"
        >
          <span>
            Paid ahead: {p.label} · {formatMoney(p.totalMinor, p.currency)}
          </span>
          {owner && (
            <ConfirmDialog
              title="Discard this payment?"
              description="Its months after this one stop counting, so the student can choose again. Months already used stay paid. MatOps does not refund; settle any money yourself."
              confirmLabel="Discard"
              onConfirm={async () => {
                await discard.mutateAsync({ purchaseId: p.id });
              }}
              trigger={
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 min-h-7 px-2"
                  busy={
                    discard.isPending && discard.variables.purchaseId === p.id
                  }
                >
                  Discard
                </Button>
              }
            />
          )}
        </li>
      ))}
    </ul>
  );
}
