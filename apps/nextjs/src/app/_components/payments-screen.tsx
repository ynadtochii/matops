"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import { formatMoney, isOwner } from "@matops/domain";
import { cn } from "@matops/ui";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import { CopyButton } from "@matops/ui/copy-button";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Select } from "@matops/ui/select";
import { Spinner } from "@matops/ui/spinner";
import { toast } from "@matops/ui/toast";
import { CreateMembershipPlanSchema } from "@matops/validators";

import { dateYearFmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { useEntity } from "./entity";
import { MyDues } from "./my-dues";
import { PageHeader } from "./page-header";
import { cardClass, Section, Tabs, TAP } from "./primitives";
import { SkeletonRows, SkeletonSection } from "./skeletons";
import { EmptyState, ErrorState } from "./states";

type Plan = RouterOutputs["payments"]["plans"][number];
type Member = RouterOutputs["membership"]["members"][number];

export function PaymentsScreen() {
  const academy = useEntity();
  if (!isOwner(academy)) return <MyDues />;
  return <OwnerPayments />;
}

/** The owner Payments screen (spec O7, ADR 40) — manual bank-transfer dues. */
function OwnerPayments() {
  const trpc = useTRPC();
  const claims = useQuery(trpc.payments.claims.queryOptions());
  const [tab, setTab] = useState<"claims" | "dues" | "plans">("claims");

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="Membership dues by bank transfer: confirm what students paid, and set plans and due dates."
      />
      <p className="text-muted-foreground mb-6 text-sm">
        Your bank details live in{" "}
        <Link href="/settings" className="underline">
          Settings
        </Link>
        , for the whole gym.
      </p>
      <Tabs
        label="Payments view"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "claims", label: "To confirm", count: claims.data?.length },
          { id: "dues", label: "Member dues" },
          { id: "plans", label: "Plans" },
        ]}
        className="mb-6"
      />
      <div>
        {tab === "claims" ? (
          <ClaimsToConfirm />
        ) : tab === "dues" ? (
          <MemberDues />
        ) : (
          <Plans />
        )}
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
    await queryClient.invalidateQueries(trpc.membership.members.pathFilter());
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
    trpc.payments.reject.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Claim rejected");
      },
      onError,
    }),
  );

  return (
    <section className="flex flex-col gap-3">
      {claims.isPending ? (
        <SkeletonRows rows={2} action gap="gap-3" />
      ) : claims.isError ? (
        <ErrorState label="claims" onRetry={() => void claims.refetch()} />
      ) : claims.data.length === 0 ? (
        <EmptyState title="No payments waiting.">
          When a student taps “I paid”, their claim shows up here to confirm.
        </EmptyState>
      ) : (
        claims.data.map((c) => {
          const confirming =
            confirm.isPending && confirm.variables.claimId === c.id;
          const rejecting =
            reject.isPending && reject.variables.claimId === c.id;
          const rowBusy = confirming || rejecting;
          return (
            <div
              key={c.id}
              className={cn(
                cardClass(),
                "flex flex-wrap items-center justify-between gap-3",
              )}
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="font-medium">
                  {c.memberName}
                  <span className="text-muted-foreground ml-2 text-sm font-normal">
                    {formatMoney(c.amountMinor, c.currency)} · {c.period}
                  </span>
                </span>
                <span className="text-muted-foreground flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
                  <span>Ref:</span>
                  <span className="font-mono break-all">{c.reference}</span>
                  <CopyButton
                    value={c.reference}
                    iconOnly
                    variant="ghost"
                    label={`Copy reference ${c.reference}`}
                    toastMessage="Reference copied"
                    className={TAP}
                  />
                  <span>
                    · said paid {dateYearFmt.format(new Date(c.claimedAt))}
                  </span>
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={rowBusy}
                  onClick={() => confirm.mutate({ claimId: c.id })}
                >
                  {confirming && <Spinner size="sm" className="text-current" />}
                  {confirming ? "Confirming…" : "Confirm"}
                </Button>
                <ConfirmDialog
                  title="Reject this claim?"
                  description={`${c.memberName} said they paid ${formatMoney(c.amountMinor, c.currency)}. Rejecting removes the claim — they'll need to send it again.`}
                  confirmLabel="Reject claim"
                  variant="destructive"
                  onConfirm={async () => {
                    await reject.mutateAsync({ claimId: c.id });
                  }}
                  trigger={
                    <Button
                      size="sm"
                      variant="destructive-outline"
                      disabled={rowBusy}
                    >
                      Reject
                    </Button>
                  }
                />
              </div>
            </div>
          );
        })
      )}
    </section>
  );
}

const DUES_GROUPS = [
  { key: "overdue", label: "Overdue" },
  { key: "due_soon", label: "Due soon" },
  { key: "paid", label: "Up to date" },
  { key: "none", label: "No plan set" },
] as const;

/** Assign each member to a plan + next-due date (spec O7), grouped by status. */
function MemberDues() {
  const trpc = useTRPC();
  const memberList = useQuery(trpc.membership.members.queryOptions());
  const plans = useQuery(trpc.payments.plans.queryOptions());

  const active = (memberList.data ?? []).filter((m) => m.status !== "pending");

  return (
    <section className="flex flex-col gap-8">
      {memberList.isPending || plans.isPending ? (
        <div className="flex flex-col gap-8">
          {[0, 1].map((i) => (
            <SkeletonSection key={i} meta>
              <SkeletonRows rows={2} action gap="gap-3" />
            </SkeletonSection>
          ))}
        </div>
      ) : memberList.isError ? (
        <ErrorState label="members" onRetry={() => void memberList.refetch()} />
      ) : (plans.data?.length ?? 0) === 0 ? (
        <EmptyState title="Add a plan first.">
          Create a membership plan on the Plans tab, then set each member’s due
          date here.
        </EmptyState>
      ) : active.length === 0 ? (
        <EmptyState title="No active members yet.">
          Approve members on the Members screen, then set their dues here.
        </EmptyState>
      ) : (
        DUES_GROUPS.map((g) => {
          const rows = active.filter(
            (m) => (m.dues?.status ?? "none") === g.key,
          );
          if (rows.length === 0) return null;
          return (
            <Section key={g.key} label={g.label} meta={`${rows.length}`}>
              <div className="flex flex-col gap-3">
                {rows.map((m) => (
                  <MemberDuesRow
                    key={m.memberId}
                    member={m}
                    plans={plans.data ?? []}
                  />
                ))}
              </div>
            </Section>
          );
        })
      )}
    </section>
  );
}

/** A `Date` as "YYYY-MM-DD" in the browser's local date (for the date input). */
function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * The default next-due date for a member the owner is setting up: the 1st of next
 * month, local time. Billing is anchored to the start of the month for everyone,
 * so the day a member joins never changes when their dues fall due (ADR 40). A
 * mid-month join defaults to the coming 1st, not to today. `new Date(y, m+1, 1)`
 * rolls the year over correctly in December.
 */
function defaultDueDate(): string {
  const now = new Date();
  return toIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 1));
}

/**
 * One member's dues. Reads as a plain summary ("Monthly · due Aug 3") with an
 * Edit button; the plan + date form only opens on Edit, so the list isn't a
 * wall of open forms. Saving or clearing both call `setMemberDues` (a null plan
 * clears it), so one mutation covers both.
 */
function MemberDuesRow({ member, plans }: { member: Member; plans: Plan[] }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const dues = member.dues;
  const archivedPlan =
    dues && !plans.some((p) => p.id === dues.planId) ? dues : null;
  const currentPlanId = dues?.planId ?? plans[0]?.id ?? "";
  const [planId, setPlanId] = useState<string>(currentPlanId);
  const [date, setDate] = useState<string>(
    member.dues ? toIsoDate(new Date(member.dues.nextDueAt)) : defaultDueDate(),
  );

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.membership.members.pathFilter());
  const onError = (err: { message: string }) =>
    toast.error(err.message || "Could not save");

  const save = useMutation(
    trpc.payments.setMemberDues.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        setEditing(false);
      },
      onError,
    }),
  );

  const startEdit = () => {
    setPlanId(currentPlanId);
    setDate(
      member.dues
        ? toIsoDate(new Date(member.dues.nextDueAt))
        : defaultDueDate(),
    );
    setEditing(true);
  };

  const dateId = `due-${member.memberId}`;

  if (!editing) {
    return (
      <div
        className={cn(
          cardClass(),
          "flex flex-wrap items-center justify-between gap-2",
        )}
      >
        <div className="flex flex-col">
          <span className="font-medium">{member.name}</span>
          {member.dues ? (
            <span className="text-muted-foreground text-sm">
              {member.dues.planName} · due{" "}
              {dateYearFmt.format(new Date(member.dues.nextDueAt))}
            </span>
          ) : (
            <span className="text-muted-foreground text-sm">No dues set</span>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={startEdit}>
          {member.dues ? "Edit dues" : "Set dues"}
        </Button>
      </div>
    );
  }

  return (
    <div className={cn(cardClass(), "flex flex-col gap-3")}>
      <span className="font-medium">{member.name}</span>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`plan-${member.memberId}`} className="text-xs">
            Plan
          </Label>
          <Select
            id={`plan-${member.memberId}`}
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
          >
            {archivedPlan && (
              <option value={archivedPlan.planId}>
                {archivedPlan.planName} ·{" "}
                {formatMoney(archivedPlan.priceMinor, archivedPlan.currency)} ·
                archived
              </option>
            )}
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {formatMoney(p.priceMinor, p.currency)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={dateId} className="text-xs">
            Next due
          </Label>
          <Input
            id={dateId}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 w-auto"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={save.isPending || !planId}
          onClick={() =>
            save.mutate({ memberId: member.memberId, planId, nextDueAt: date })
          }
        >
          {save.isPending && <Spinner size="sm" className="text-current" />}
          {save.isPending ? "Saving…" : "Save"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={save.isPending}
          onClick={() => setEditing(false)}
        >
          Cancel
        </Button>
        {member.dues && (
          <Button
            size="sm"
            variant="destructive-outline"
            className="ml-auto"
            disabled={save.isPending}
            onClick={() =>
              save.mutate({
                memberId: member.memberId,
                planId: null,
                nextDueAt: date,
              })
            }
          >
            Clear dues
          </Button>
        )}
      </div>
    </div>
  );
}

function planPriceMinor(price: string): number {
  return Math.round(parseFloat(price) * 100);
}

/** The same rules the server enforces, so the button and the API agree. */
function planFieldsValid(name: string, price: string, currency: string) {
  return CreateMembershipPlanSchema.safeParse({
    name,
    priceMinor: planPriceMinor(price),
    currency,
    cycle: "monthly",
  }).success;
}

function PlanFields({
  idPrefix,
  name,
  setName,
  price,
  setPrice,
  currency,
  setCurrency,
}: {
  idPrefix: string;
  name: string;
  setName: (v: string) => void;
  price: string;
  setPrice: (v: string) => void;
  currency: string;
  setCurrency: (v: string) => void;
}) {
  return (
    <>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idPrefix}-name`} className="text-xs">
          Name
        </Label>
        <Input
          id={`${idPrefix}-name`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Adult"
          className="h-9 w-40"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idPrefix}-price`} className="text-xs">
          Price / month
        </Label>
        <Input
          id={`${idPrefix}-price`}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          inputMode="decimal"
          placeholder="50"
          className="h-9 w-28"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${idPrefix}-currency`} className="text-xs">
          Currency
        </Label>
        <Input
          id={`${idPrefix}-currency`}
          value={currency}
          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          maxLength={3}
          className="h-9 w-20"
        />
      </div>
    </>
  );
}

/** One plan — a summary row that swaps to an edit form on Edit. */
function PlanRow({ plan }: { plan: Plan }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(plan.name);
  const [price, setPrice] = useState((plan.priceMinor / 100).toString());
  const [currency, setCurrency] = useState(plan.currency);

  const invalidate = async () => {
    await queryClient.invalidateQueries(trpc.payments.plans.pathFilter());
    await queryClient.invalidateQueries(trpc.membership.members.pathFilter());
  };
  const onError = (err: { message: string }) =>
    toast.error(err.message || "Could not save");

  const update = useMutation(
    trpc.payments.updatePlan.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        setEditing(false);
        toast.success("Plan updated");
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

  const startEdit = () => {
    setName(plan.name);
    setPrice((plan.priceMinor / 100).toString());
    setCurrency(plan.currency);
    setEditing(true);
  };

  if (editing) {
    return (
      <div className={cn(cardClass(), "flex flex-col gap-3")}>
        <div className="flex flex-wrap items-end gap-3">
          <PlanFields
            idPrefix={`plan-${plan.id}`}
            name={name}
            setName={setName}
            price={price}
            setPrice={setPrice}
            currency={currency}
            setCurrency={setCurrency}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={
              update.isPending || !planFieldsValid(name, price, currency)
            }
            onClick={() =>
              update.mutate({
                id: plan.id,
                name: name.trim(),
                priceMinor: planPriceMinor(price),
                currency: currency.trim().toUpperCase(),
                cycle: plan.cycle,
              })
            }
          >
            {update.isPending && <Spinner size="sm" className="text-current" />}
            {update.isPending ? "Saving…" : "Save"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={update.isPending}
            onClick={() => setEditing(false)}
          >
            Cancel
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Members on this plan see the new name and price right away. Payments
          already confirmed keep the amount they were paid at.
        </p>
      </div>
    );
  }

  return (
    <div className={cn(cardClass(), "flex items-center justify-between gap-3")}>
      <span className="font-medium">
        {plan.name}
        <span className="text-muted-foreground ml-2 text-sm font-normal">
          {formatMoney(plan.priceMinor, plan.currency)} / month
        </span>
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={startEdit}>
          Edit
        </Button>
        <ConfirmDialog
          title={`Delete the ${plan.name} plan?`}
          description="Members already on this plan keep their due dates. You just can't assign it to anyone new."
          confirmLabel="Delete plan"
          variant="destructive"
          onConfirm={async () => {
            await remove.mutateAsync({ id: plan.id });
          }}
          trigger={
            <Button
              size="sm"
              variant="destructive-outline"
              disabled={remove.isPending}
            >
              Delete
            </Button>
          }
        />
      </div>
    </div>
  );
}

/** The academy's membership plans — list, create, edit, soft-delete. */
function Plans() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const plans = useQuery(trpc.payments.plans.queryOptions());
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("USD");

  const create = useMutation(
    trpc.payments.createPlan.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.payments.plans.pathFilter());
        setName("");
        setPrice("");
        toast.success("Plan added");
      },
      onError: (err) => toast.error(err.message || "Could not save"),
    }),
  );

  const canAdd = planFieldsValid(name, price, currency);

  return (
    <section className="flex flex-col gap-3">
      {plans.isPending ? (
        <SkeletonRows rows={2} action gap="gap-3" />
      ) : plans.isError ? (
        <ErrorState label="plans" onRetry={() => void plans.refetch()} />
      ) : plans.data.length === 0 ? (
        <EmptyState title="No plans yet.">
          Add your monthly membership price below (e.g. “Adult · 50”).
        </EmptyState>
      ) : (
        plans.data.map((p) => <PlanRow key={p.id} plan={p} />)
      )}

      <div className="border-border flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-4">
        <PlanFields
          idPrefix="new-plan"
          name={name}
          setName={setName}
          price={price}
          setPrice={setPrice}
          currency={currency}
          setCurrency={setCurrency}
        />
        <Button
          size="sm"
          disabled={!canAdd || create.isPending}
          onClick={() =>
            create.mutate({
              name: name.trim(),
              priceMinor: planPriceMinor(price),
              currency: currency.trim().toUpperCase(),
              cycle: "monthly",
            })
          }
        >
          {create.isPending && <Spinner size="sm" className="text-current" />}
          {create.isPending ? "Adding…" : "Add plan"}
        </Button>
      </div>
    </section>
  );
}
