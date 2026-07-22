"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import { cn } from "@matops/ui";
import { Button } from "@matops/ui/button";
import { Input } from "@matops/ui/input";
import { Select } from "@matops/ui/select";
import { toast } from "@matops/ui/toast";

import { formatMoney } from "~/lib/money";
import { useTRPC } from "~/trpc/react";
import { PageHeader } from "./page-header";
import { cardClass, SectionHeading } from "./primitives";
import { EmptyState, ErrorState, SkeletonRows } from "./states";

type Plan = RouterOutputs["payments"]["plans"][number];
type Member = RouterOutputs["membership"]["roster"][number];

const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** The owner Payments screen (spec O7, ADR 40) — manual bank-transfer dues. */
export function PaymentsScreen() {
  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Membership dues by bank transfer — confirm what students paid, set plans and due dates."
      />
      <div className="flex flex-col gap-10">
        <ClaimsToConfirm />
        <MemberDues />
        <Plans />
      </div>
    </>
  );
}

/** Pending "I paid" claims — one tap to confirm (rolls the due date) or reject. */
function ClaimsToConfirm() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const claims = useQuery(trpc.payments.claims.queryOptions());

  const invalidate = async () => {
    await queryClient.invalidateQueries(trpc.payments.pathFilter());
    await queryClient.invalidateQueries(trpc.membership.roster.pathFilter());
  };
  const onError = (err: { message: string }) =>
    toast.error(err.message || "Action failed");

  const confirm = useMutation(
    trpc.payments.confirm.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Payment confirmed");
      },
      onError,
    }),
  );
  const reject = useMutation(
    trpc.payments.reject.mutationOptions({ onSuccess: invalidate, onError }),
  );
  const busy = confirm.isPending || reject.isPending;

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading count={claims.data?.length}>
        Claims to confirm
      </SectionHeading>
      {claims.isPending ? (
        <SkeletonRows rows={2} />
      ) : claims.isError ? (
        <ErrorState label="claims" onRetry={() => void claims.refetch()} />
      ) : claims.data.length === 0 ? (
        <EmptyState title="No payments waiting.">
          When a student taps “I paid”, their claim shows up here to confirm.
        </EmptyState>
      ) : (
        claims.data.map((c) => (
          <div
            key={c.id}
            className={cn(
              cardClass(),
              "flex flex-wrap items-center justify-between gap-3",
            )}
          >
            <div className="flex flex-col">
              <span className="font-medium">
                {c.memberName}
                <span className="text-muted-foreground ml-2 text-sm font-normal">
                  {formatMoney(c.amountMinor, c.currency)} · {c.period}
                </span>
              </span>
              <span className="text-muted-foreground text-sm">
                Ref: <span className="font-mono">{c.reference}</span> · said
                paid {dateFmt.format(new Date(c.claimedAt))}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={busy}
                onClick={() => confirm.mutate({ claimId: c.id })}
              >
                Confirm
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => reject.mutate({ claimId: c.id })}
              >
                Reject
              </Button>
            </div>
          </div>
        ))
      )}
    </section>
  );
}

/** Assign each member to a plan + next-due date (spec O7). */
function MemberDues() {
  const trpc = useTRPC();
  const roster = useQuery(trpc.membership.roster.queryOptions());
  const plans = useQuery(trpc.payments.plans.queryOptions());

  const active = (roster.data ?? []).filter((m) => m.status !== "pending");

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>Member dues</SectionHeading>
      {roster.isPending || plans.isPending ? (
        <SkeletonRows rows={3} />
      ) : roster.isError ? (
        <ErrorState label="members" onRetry={() => void roster.refetch()} />
      ) : (plans.data?.length ?? 0) === 0 ? (
        <EmptyState title="Add a plan first.">
          Create a membership plan below, then set each member’s due date here.
        </EmptyState>
      ) : active.length === 0 ? (
        <EmptyState title="No active members yet.">
          Approve members in the Roster, then set their dues here.
        </EmptyState>
      ) : (
        active.map((m) => (
          <MemberDuesRow key={m.memberId} member={m} plans={plans.data ?? []} />
        ))
      )}
    </section>
  );
}

/** Today as "YYYY-MM-DD" in the browser's local date (for the date input). */
function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function MemberDuesRow({ member, plans }: { member: Member; plans: Plan[] }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [planId, setPlanId] = useState<string>(plans[0]?.id ?? "");
  const [date, setDate] = useState<string>(todayIso());

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.membership.roster.pathFilter());
  const onError = (err: { message: string }) =>
    toast.error(err.message || "Could not save");

  const set = useMutation(
    trpc.payments.setMemberDues.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Dues updated");
      },
      onError,
    }),
  );
  const clear = useMutation(
    trpc.payments.setMemberDues.mutationOptions({
      onSuccess: invalidate,
      onError,
    }),
  );
  const busy = set.isPending || clear.isPending;

  return (
    <div className={cn(cardClass(), "flex flex-col gap-3")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{member.name}</span>
        {member.dues ? (
          <span className="text-muted-foreground text-sm">
            {member.dues.planName} · due{" "}
            {dateFmt.format(new Date(member.dues.nextDueAt))}
          </span>
        ) : (
          <span className="text-muted-foreground text-sm">No dues set</span>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Select value={planId} onChange={(e) => setPlanId(e.target.value)}>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {formatMoney(p.priceMinor, p.currency)}
            </option>
          ))}
        </Select>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-9 w-auto"
        />
        <Button
          size="sm"
          disabled={busy || !planId}
          onClick={() =>
            set.mutate({ memberId: member.memberId, planId, nextDueAt: date })
          }
        >
          {member.dues ? "Update" : "Set dues"}
        </Button>
        {member.dues && (
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() =>
              clear.mutate({
                memberId: member.memberId,
                planId: null,
                nextDueAt: date,
              })
            }
          >
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}

/** The academy's membership plans — list, create, soft-delete. */
function Plans() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const plans = useQuery(trpc.payments.plans.queryOptions());
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("USD");

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.payments.plans.pathFilter());
  const onError = (err: { message: string }) =>
    toast.error(err.message || "Could not save");

  const create = useMutation(
    trpc.payments.createPlan.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        setName("");
        setPrice("");
        toast.success("Plan added");
      },
      onError,
    }),
  );
  const remove = useMutation(
    trpc.payments.deletePlan.mutationOptions({
      onSuccess: invalidate,
      onError,
    }),
  );

  const priceMinor = Math.round(parseFloat(price) * 100);
  const canAdd =
    name.trim().length > 0 &&
    Number.isFinite(priceMinor) &&
    priceMinor >= 0 &&
    /^[A-Za-z]{3}$/.test(currency.trim());

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading>Plans</SectionHeading>
      {plans.isPending ? (
        <SkeletonRows rows={2} />
      ) : plans.isError ? (
        <ErrorState label="plans" onRetry={() => void plans.refetch()} />
      ) : plans.data.length === 0 ? (
        <EmptyState title="No plans yet.">
          Add your monthly membership price below (e.g. “Adult · 50”).
        </EmptyState>
      ) : (
        plans.data.map((p) => (
          <div
            key={p.id}
            className={cn(
              cardClass(),
              "flex items-center justify-between gap-3",
            )}
          >
            <span className="font-medium">
              {p.name}
              <span className="text-muted-foreground ml-2 text-sm font-normal">
                {formatMoney(p.priceMinor, p.currency)} / month
              </span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={remove.isPending}
              onClick={() => remove.mutate({ id: p.id })}
            >
              Delete
            </Button>
          </div>
        ))
      )}

      <div className="border-border flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground text-xs">Name</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Adult"
            className="h-9 w-40"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground text-xs">Price / month</span>
          <Input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            placeholder="50"
            className="h-9 w-28"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground text-xs">Currency</span>
          <Input
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            maxLength={3}
            className="h-9 w-20"
          />
        </label>
        <Button
          size="sm"
          disabled={!canAdd || create.isPending}
          onClick={() =>
            create.mutate({
              name: name.trim(),
              priceMinor,
              currency: currency.trim().toUpperCase(),
              cycle: "monthly",
            })
          }
        >
          Add plan
        </Button>
      </div>
    </section>
  );
}
