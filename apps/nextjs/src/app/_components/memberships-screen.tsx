"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import {
  entityHref,
  formatMoney,
  formatMonth,
  nextMonth,
  organizationHref,
} from "@matops/domain";
import { Button } from "@matops/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@matops/ui/dialog";
import { FieldError } from "@matops/ui/field";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Textarea } from "@matops/ui/textarea";
import { toast } from "@matops/ui/toast";
import {
  CreateAccessPlanSchema,
  SetAccessPlanPriceSchema,
} from "@matops/validators";

import { dateFmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { useOrganization } from "./entity";
import { MembershipPurchaseReview } from "./membership-purchase-review";
import { cardClass, ENTER, Eyebrow, Section, stagger } from "./primitives";
import { SkeletonRows } from "./skeletons";
import { EmptyState, ErrorState } from "./states";

type Plan = RouterOutputs["accessPlan"]["list"][number];
type Affected = RouterOutputs["accessPlan"]["coveragePreview"]["affected"];

/**
 * The organization's membership plans (ADR 126).
 *
 * It sits beside `/overview` rather than inside a branch on purpose: a plan
 * belongs to the owner group and can cover a mat and a gym at once, so there is
 * no single branch it could live under. Assigning one to a person happens on
 * that person's member profile inside a branch, which is where an owner already
 * is when they think about it.
 */
export function MembershipsScreen() {
  const { entities, canRunOrganization, role } = useOrganization();
  const trpc = useTRPC();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const branchId = searchParams.get("branch") ?? undefined;
  const tab =
    tabParam === "access" || tabParam === "plans" ? tabParam : "payments";
  const plans = useQuery({
    ...trpc.accessPlan.list.queryOptions(),
    enabled: canRunOrganization && tab === "plans",
  });
  const [editing, setEditing] = useState<Plan | null>(null);
  const [adding, setAdding] = useState(false);

  const nameOf = (id: string) =>
    entities.find((e) => e.id === id)?.name ?? "A closed branch";

  if (!canRunOrganization) {
    return (
      <div>
        <EmptyState title="Only the people who run this gym can shape its membership plans.">
          Ask whoever runs the gym.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Memberships</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Track payments, resolve access issues, and manage your plans.
          </p>
        </div>
        {tab === "plans" && (
          <Button size="sm" onClick={() => setAdding(true)}>
            New plan
          </Button>
        )}
      </div>

      <nav
        aria-label="Membership views"
        className="border-border flex gap-1 overflow-x-auto border-b"
      >
        {[
          { id: "payments", label: "Payments" },
          { id: "access", label: "Access issues" },
          { id: "plans", label: "Plans" },
        ].map((view) => (
          <Link
            key={view.id}
            href={`/memberships?tab=${view.id}`}
            scroll={false}
            aria-current={tab === view.id ? "page" : undefined}
            className={`focus-visible:outline-ring min-h-11 shrink-0 border-b-2 px-4 py-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 ${tab === view.id ? "border-brand text-foreground font-medium" : "text-muted-foreground hover:text-foreground border-transparent"}`}
          >
            {view.label}
          </Link>
        ))}
      </nav>

      {tab === "payments" && (
        <div className="flex min-w-0 flex-col gap-8">
          <MembershipPurchaseReview />
          <ClaimsWaiting />
          <MonthBoard nameOf={nameOf} />
        </div>
      )}
      {tab === "access" && (
        <div className="flex min-w-0 flex-col gap-8">
          <UncoveredQueue />
          <BookingAccessQueue />
        </div>
      )}
      {tab === "plans" && (
        <div className="flex min-w-0 flex-col gap-6">
          <p className="text-muted-foreground text-sm">
            Set prices and covered branches, then make plans available for
            students to choose. You can also assign plans from a person’s
            profile.
          </p>
          {plans.isPending ? (
            <SkeletonRows rows={3} />
          ) : plans.isError ? (
            <ErrorState
              label="your plans"
              onRetry={() => void plans.refetch()}
            />
          ) : plans.data.length === 0 ? (
            <EmptyState
              title="No membership plans yet."
              action={<Button onClick={() => setAdding(true)}>New plan</Button>}
            >
              Make one for each thing you sell: BJJ only, BJJ and gym, gym and
              sauna.
            </EmptyState>
          ) : (
            <Section label="Plans" meta={`${plans.data.length} total`}>
              <ul className="flex flex-col gap-2">
                {plans.data.map((p, i) => (
                  <li key={p.id} style={stagger(i)} className={ENTER}>
                    <PlanCard
                      plan={p}
                      nameOf={nameOf}
                      onEdit={() => setEditing(p)}
                    />
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {role === "owner" && (
            <p className="text-muted-foreground border-border border-t pt-4 text-sm">
              Manage payment deadlines, time zone, and bank details in{" "}
              <Link
                href={organizationHref("/settings", branchId)}
                className="underline underline-offset-4"
              >
                Organization settings
              </Link>
              .
            </p>
          )}
        </div>
      )}

      <NewPlanDialog open={adding} onOpenChange={setAdding} />
      {editing && (
        <CoverageDialog
          plan={editing}
          onOpenChange={(open) => !open && setEditing(null)}
        />
      )}
    </div>
  );
}

/**
 * Claims waiting for an answer (ADR 127).
 *
 * Confirm is the same `markMonth` the board uses, which is what makes the two
 * doors reach one record. Reject clears the claim and changes nothing else, so
 * the member can send the money and say so again.
 */
function ClaimsWaiting() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const claims = useQuery(trpc.accessPlan.claims.queryOptions());

  const invalidate = async () => {
    await queryClient.invalidateQueries(trpc.accessPlan.pathFilter());
    await queryClient.invalidateQueries(
      trpc.stats.navigationSummary.pathFilter(),
    );
  };
  const onError = (e: { message: string }) =>
    toast.error(e.message || "Could not do that");

  const confirm = useMutation(
    trpc.accessPlan.markMonth.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Payment confirmed");
      },
      onError,
    }),
  );
  const reject = useMutation(
    trpc.accessPlan.rejectClaim.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Claim rejected");
      },
      onError,
    }),
  );

  if (claims.isPending) return <SkeletonRows rows={2} />;
  if (claims.isError)
    return (
      <ErrorState
        label="payment claims"
        onRetry={() => void claims.refetch()}
      />
    );
  const rows = claims.data;
  if (rows.length === 0)
    return (
      <section className="border-border flex flex-col gap-1 border-b pb-5">
        <h2 className="text-base font-semibold">Renewal payment claims</h2>
        <p className="text-muted-foreground text-sm">
          No claims to review. You can record payments in the monthly list
          below.
        </p>
      </section>
    );

  return (
    <div className={`${cardClass()} flex flex-col gap-3`}>
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">
          Renewal payment claims{" "}
          <span className="text-muted-foreground text-sm font-normal">
            ({rows.length})
          </span>
        </h2>
        <p className="text-muted-foreground text-sm">
          Review payments reported by members before confirming them.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {rows.map((c) => {
          const busy =
            (confirm.isPending &&
              confirm.variables.assignmentId === c.assignmentId) ||
            (reject.isPending &&
              reject.variables.assignmentId === c.assignmentId);
          return (
            <li
              key={`${c.assignmentId}:${c.month}`}
              className="border-border/70 flex flex-wrap items-center gap-3 rounded-lg border p-3"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{c.name}</span>
                <span className="text-muted-foreground truncate text-sm">
                  {c.planName} · {c.monthLabel}
                </span>
                {c.claimedAt && (
                  <span className="text-muted-foreground text-xs">
                    Said they paid on {dateFmt.format(new Date(c.claimedAt))}
                  </span>
                )}
              </div>
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  confirm.mutate({
                    assignmentId: c.assignmentId,
                    month: c.month,
                    paid: true,
                  })
                }
              >
                Confirm
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  reject.mutate({
                    assignmentId: c.assignmentId,
                    month: c.month,
                  })
                }
              >
                Reject
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * This month, membership by membership, with a tick against each (ADR 126).
 *
 * The same record the member profile ticks, read the other way round. An owner
 * confirming payments works from a bank statement in one pass, so the list is
 * the whole gym rather than one branch, and the unpaid ones come first because
 * they are the only rows anybody has to act on.
 *
 * A month nobody has ticked is unpaid. There is no third state, so the button
 * says what it will do rather than asking a question.
 */
function MonthBoard({ nameOf }: { nameOf: (id: string) => string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const board = useQuery(trpc.accessPlan.monthBoard.queryOptions());
  const mark = useMutation(
    trpc.accessPlan.markMonth.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.accessPlan.pathFilter());
        await queryClient.invalidateQueries(
          trpc.stats.navigationSummary.pathFilter(),
        );
      },
      onError: (e) => toast.error(e.message || "Could not record that"),
    }),
  );

  if (board.isPending) return <SkeletonRows rows={3} />;
  if (board.isError) {
    return (
      <ErrorState label="this month" onRetry={() => void board.refetch()} />
    );
  }

  const rows = [...board.data.rows].sort((a, b) =>
    a.paid === b.paid ? a.name.localeCompare(b.name) : a.paid ? 1 : -1,
  );

  return (
    <div className={`${cardClass()} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">Monthly payments</h2>
          <p className="text-muted-foreground text-sm">
            {board.data.monthLabel}
          </p>
        </div>
        <span className="text-muted-foreground text-sm">
          {rows.filter((r) => r.paymentRequired && r.paid).length} of{" "}
          {rows.filter((r) => r.paymentRequired).length} paid
          {rows.some((r) => !r.paymentRequired) &&
            ` · ${rows.filter((r) => !r.paymentRequired).length} free`}
          {board.data.unpriced > 0 &&
            ` · ${board.data.unpriced} on a plan with no price`}
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Nobody holds a membership yet.">
          Give somebody one on their member profile, in any branch.
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li
              key={r.assignmentId}
              className="border-border/70 flex flex-wrap items-center gap-3 rounded-lg border p-3"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate font-medium">{r.name}</span>
                <span className="text-muted-foreground truncate text-sm">
                  {r.planName}
                  {/* What THIS month costs, so the owner reading a bank
                      statement is comparing against the right figure. */}
                  {r.amount
                    ? ` · ${formatMoney(r.amount.priceMinor, r.amount.currency)}`
                    : " · no price yet"}
                  {r.entityIds.length > 0 &&
                    ` · ${r.entityIds.map(nameOf).join(" · ")}`}
                </span>
                {!r.paid && r.paymentRequired && (
                  <span className="text-muted-foreground text-xs">
                    {r.overdue
                      ? `Blocked since ${r.deadlineLabel}`
                      : `Until ${r.deadlineLabel}`}
                  </span>
                )}
              </div>
              {!r.paymentRequired ? (
                <span className="text-muted-foreground text-sm">
                  No payment required
                </span>
              ) : (
                <Button
                  size="sm"
                  variant={r.paid ? "outline" : "primary"}
                  disabled={mark.isPending}
                  onClick={() =>
                    mark.mutate({
                      assignmentId: r.assignmentId,
                      month: board.data.month,
                      paid: !r.paid,
                    })
                  }
                >
                  {r.paid ? "Undo paid" : "Mark paid"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BookingAccessQueue() {
  const trpc = useTRPC();
  const review = useQuery(
    trpc.accessPlan.bookingsToReview.queryOptions({ limit: 50 }),
  );
  if (review.isPending) return <SkeletonRows rows={2} />;
  if (review.isError)
    return (
      <ErrorState
        label="bookings with access issues"
        onRetry={() => void review.refetch()}
      />
    );
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">Bookings without access</h2>
        <p className="text-muted-foreground text-sm">
          Review upcoming bookings whose membership no longer allows access.
        </p>
      </div>
      {review.data.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No bookings need an access review.
        </p>
      ) : (
        <ul className="divide-border divide-y">
          {review.data.items.map((booking) => (
            <li
              key={booking.participationId}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <Link
                  href={`/people/${booking.personId}`}
                  className="w-fit text-sm font-medium underline underline-offset-4"
                >
                  {booking.name}
                </Link>
                <span className="text-muted-foreground text-sm wrap-anywhere">
                  {booking.title} · {booking.entityName} ·{" "}
                  {dateFmt.format(new Date(booking.startsAt))}
                </span>
              </div>
              <Link
                href={entityHref(booking.entityId, `/class/${booking.classId}`)}
                className="text-brand-strong inline-flex min-h-11 items-center text-sm underline underline-offset-4"
              >
                Review booking
              </Link>
            </li>
          ))}
        </ul>
      )}
      {review.data.more && (
        <p className="text-muted-foreground text-sm">
          Showing up to 50 bookings. Resolve these issues to reveal more.
        </p>
      )}
    </section>
  );
}

function PlanCard({
  plan,
  nameOf,
  onEdit,
}: {
  plan: Plan;
  nameOf: (id: string) => string;
  onEdit: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries(trpc.accessPlan.list.pathFilter());
  const archive = useMutation(
    trpc.accessPlan.archive.mutationOptions({
      onSuccess: invalidate,
      onError: (e) => toast.error(e.message),
    }),
  );
  const [pricing, setPricing] = useState(false);
  const availability = useMutation(
    trpc.membershipPurchase.setAvailability.mutationOptions({
      onSuccess: async () => {
        await Promise.all([
          invalidate(),
          queryClient.invalidateQueries(trpc.membershipPurchase.pathFilter()),
        ]);
      },
    }),
  );

  return (
    <div className={`${cardClass()} flex flex-wrap gap-3`}>
      <PriceDialog plan={plan} open={pricing} onOpenChange={setPricing} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-medium">
          {plan.name}
          {plan.archived && (
            <span className="text-muted-foreground ml-2 text-xs uppercase">
              archived
            </span>
          )}
        </span>
        <span className="text-muted-foreground text-sm">
          {plan.priceMinor !== null && plan.currency
            ? `${formatMoney(plan.priceMinor, plan.currency)} a month`
            : "No price yet"}
          {" · "}
          {plan.entityIds.length === 0
            ? "Covers no branch yet"
            : plan.entityIds.map(nameOf).join(" · ")}
        </span>
        <span className="text-muted-foreground text-xs">
          {plan.activeHolders === 1
            ? "1 member holds it"
            : `${plan.activeHolders} members hold it`}
        </span>
      </div>
      <div className="flex flex-wrap items-start justify-end gap-2">
        {!plan.archived && plan.gaps.missing > 0 && (
          <Reconcile planId={plan.id} missing={plan.gaps.missing} />
        )}
        {!plan.archived && (
          <Button size="sm" variant="outline" onClick={() => setPricing(true)}>
            {plan.priceMinor === null ? "Set price" : "Price"}
          </Button>
        )}
        {!plan.archived && (
          <Button size="sm" variant="outline" onClick={onEdit}>
            Branches
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={archive.isPending}
          onClick={() =>
            archive.mutate({ id: plan.id, archived: !plan.archived })
          }
        >
          {plan.archived ? "Restore" : "Archive"}
        </Button>
      </div>
      {!plan.archived && (
        <div className="border-border flex w-full flex-col gap-2 border-t pt-3">
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="accent-brand mt-1 size-4 shrink-0"
              checked={plan.studentSelectable}
              disabled={availability.isPending}
              onChange={(event) =>
                availability.mutate({
                  planId: plan.id,
                  available: event.target.checked,
                })
              }
            />
            <span>
              <span className="block font-medium">Available to students</span>
              <span className="text-muted-foreground block">
                Students can choose this plan. Access starts after you approve
                it.
              </span>
            </span>
          </label>
          {availability.isError && (
            <FieldError>{availability.error.message}</FieldError>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Price a plan that has one, or one made with "price it later" (ADR 127).
 *
 * A change starts from a month nobody has been billed for, so the default is
 * next month and the server refuses anything earlier. The one exception is a
 * plan that has never had a price: its first one may start this month, because
 * no member has been asked for an amount on it yet.
 */
function PriceDialog({
  plan,
  open,
  onOpenChange,
}: {
  plan: Plan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const board = useQuery(trpc.accessPlan.monthBoard.queryOptions());
  const unpriced = plan.priceMinor === null;
  const earliest = board.data
    ? unpriced
      ? board.data.month
      : nextMonth(board.data.month)
    : null;

  const [amount, setAmount] = useState(
    plan.priceMinor === null ? "" : (plan.priceMinor / 100).toFixed(2),
  );
  const [currency, setCurrency] = useState(plan.currency ?? "EUR");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation(
    trpc.accessPlan.setPrice.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.accessPlan.list.pathFilter());
        setError(null);
        onOpenChange(false);
        toast.success("Price saved");
      },
      onError: (e) => toast.error(e.message || "Could not save that price"),
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>{plan.name}</DialogTitle>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!earliest) return;
            const parsed = SetAccessPlanPriceSchema.safeParse({
              id: plan.id,
              priceMinor: Math.round(parseFloat(amount.trim()) * 100),
              currency,
              effectiveMonth: earliest,
            });
            if (!parsed.success) {
              setError("Give the price as a number, like 45 or 45.50.");
              return;
            }
            setError(null);
            save.mutate(parsed.data);
          }}
        >
          <p className="text-muted-foreground text-sm">
            {earliest
              ? `Applies from ${formatMonth(earliest, board.data?.timeZone ?? "UTC")}. Earlier months keep the amount members were already asked for.`
              : "Reading your gym's calendar…"}
          </p>
          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor={`price-${plan.id}`}>A month</Label>
              <Input
                id={`price-${plan.id}`}
                inputMode="decimal"
                value={amount}
                placeholder="45"
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="flex w-28 flex-col gap-2">
              <Label htmlFor={`currency-${plan.id}`}>Currency</Label>
              <Input
                id={`currency-${plan.id}`}
                maxLength={3}
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              />
            </div>
          </div>
          {error && <FieldError>{error}</FieldError>}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending || !earliest}>
              {save.isPending ? "Saving…" : "Save price"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NewPlanDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { entities } = useOrganization();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation(
    trpc.accessPlan.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.accessPlan.list.pathFilter());
        setName("");
        setDescription("");
        setPicked([]);
        setPrice("");
        setError(null);
        onOpenChange(false);
      },
      onError: (e) => toast.error(e.message || "Could not add that plan"),
    }),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>New membership plan</DialogTitle>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            // A blank price is "not priced yet", not zero: the two fields go
            // together or not at all, which is what the schema and the column
            // both say (ADR 128).
            const typed = price.trim();
            const parsed = CreateAccessPlanSchema.safeParse({
              name,
              description,
              entityIds: picked,
              priceMinor:
                typed === "" ? undefined : Math.round(parseFloat(typed) * 100),
              currency: typed === "" ? undefined : currency,
            });
            if (!parsed.success) {
              setError(
                typed === ""
                  ? "Give the plan a name of 1-80 characters."
                  : "Check the name, and give the price as a number.",
              );
              return;
            }
            setError(null);
            create.mutate(parsed.data);
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="plan-name">Name</Label>
            <Input
              id="plan-name"
              value={name}
              autoFocus
              placeholder="BJJ + Gym"
              aria-invalid={error ? true : undefined}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
            />
            {error && <FieldError id="plan-name-error">{error}</FieldError>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="plan-description">Description</Label>
            <Textarea
              id="plan-description"
              rows={2}
              maxLength={500}
              value={description}
              placeholder="What it covers, in your own words. Optional."
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="plan-price">Price a month</Label>
              <Input
                id="plan-price"
                value={price}
                inputMode="decimal"
                placeholder="Leave empty to price it later"
                onChange={(e) => {
                  setPrice(e.target.value);
                  setError(null);
                }}
              />
            </div>
            <div className="flex w-28 flex-col gap-2">
              <Label htmlFor="plan-currency">Currency</Label>
              <Input
                id="plan-currency"
                value={currency}
                maxLength={3}
                onChange={(e) => {
                  setCurrency(e.target.value.toUpperCase());
                  setError(null);
                }}
              />
            </div>
          </div>
          <BranchTicks
            entities={entities}
            picked={picked}
            onChange={setPicked}
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Adding…" : "Add plan"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Change which branches a plan covers, showing who it reaches first.
 *
 * The preview is the same call the mutation makes, so what the owner reads is
 * what will happen. Adding a branch enrols the plan's live holders there in the
 * same save (ADR 129), so "gains" is work the save does rather than work left
 * behind. A branch row that is suspended, archived or removed is never touched,
 * and comes back as a decision for a person to make.
 */
function CoverageDialog({
  plan,
  onOpenChange,
}: {
  plan: Plan;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { entities } = useOrganization();
  const [picked, setPicked] = useState<string[]>(plan.entityIds);

  const changed =
    picked.length !== plan.entityIds.length ||
    picked.some((id) => !plan.entityIds.includes(id));

  const preview = useQuery(
    trpc.accessPlan.coveragePreview.queryOptions(
      { id: plan.id, entityIds: picked },
      { enabled: changed },
    ),
  );

  const save = useMutation(
    trpc.accessPlan.setCoverage.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries();
        toast.success(coverageResultMessage(result));
        onOpenChange(false);
      },
      onError: (e) => toast.error(e.message || "Could not save that"),
    }),
  );

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Branches on {plan.name}</DialogTitle>
        <div className="flex flex-col gap-4">
          <BranchTicks
            entities={entities}
            picked={picked}
            onChange={setPicked}
          />
          {changed && (
            <AffectedNotice
              affected={preview.data?.affected}
              loading={preview.isPending}
              entities={entities}
            />
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              disabled={!changed || save.isPending}
              onClick={() =>
                save.mutate({
                  id: plan.id,
                  entityIds: picked,
                  version: preview.data?.version,
                })
              }
            >
              {save.isPending ? "Saving…" : "Save branches"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * What a coverage save actually did, in one line. Enrolment is part of the same
 * call now, so the owner is told whether it finished rather than being sent to
 * press a second button (ADR 129).
 */
function coverageResultMessage(
  result: RouterOutputs["accessPlan"]["setCoverage"],
): string {
  const enrolled = result.enrolled.length;
  const stuck = result.failed.length + result.needsDecision.length;
  if (enrolled === 0 && stuck === 0) return "Branches saved";
  const done =
    enrolled === 0
      ? "Branches saved"
      : enrolled === 1
        ? "Branches saved. 1 member enrolled"
        : `Branches saved. ${enrolled} members enrolled`;
  return stuck === 0
    ? done
    : `${done}. ${stuck} still need a decision on the Memberships list`;
}

function AffectedNotice({
  affected,
  loading,
  entities,
}: {
  affected: Affected | undefined;
  loading: boolean;
  entities: { id: string; name: string }[];
}) {
  const nameOf = (id: string) =>
    entities.find((e) => e.id === id)?.name ?? "a closed branch";

  if (loading) {
    return (
      <p className="text-muted-foreground text-sm">
        Working out who this hits…
      </p>
    );
  }
  if (!affected || affected.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nobody's access changes. Members holding this plan keep what they reach
        through their other memberships.
      </p>
    );
  }

  const gaining = affected.filter((a) => a.gains.length > 0);
  const losing = affected.filter((a) => a.loses.length > 0);

  return (
    <div className="flex flex-col gap-2">
      <Eyebrow>Who this changes</Eyebrow>
      {gaining.length > 0 && (
        <p className="text-sm">
          {gaining.length === 1
            ? "1 member gains"
            : `${gaining.length} members gain`}{" "}
          {[...new Set(gaining.flatMap((a) => a.gains))].map(nameOf).join(", ")}
          . Saving enrols them there; anyone whose place at that branch is
          paused or archived is left alone and listed for you to settle.
        </p>
      )}
      {losing.length > 0 && (
        <p className="text-sm">
          {losing.length === 1
            ? "1 member loses"
            : `${losing.length} members lose`}{" "}
          {[...new Set(losing.flatMap((a) => a.loses))].map(nameOf).join(", ")}.
          Nothing else of theirs covers it. Their branch membership, attendance
          and history stay.
        </p>
      )}
    </div>
  );
}

function BranchTicks({
  entities,
  picked,
  onChange,
}: {
  entities: { id: string; name: string }[];
  picked: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">Branches it covers</legend>
      {entities.map((e) => (
        <label
          key={e.id}
          className="text-muted-foreground hover:text-foreground flex min-h-11 cursor-pointer items-center gap-2 text-sm"
        >
          <input
            type="checkbox"
            className="accent-brand size-4"
            checked={picked.includes(e.id)}
            onChange={(ev) =>
              onChange(
                ev.target.checked
                  ? [...picked, e.id]
                  : picked.filter((id) => id !== e.id),
              )
            }
          />
          {e.name}
        </label>
      ))}
    </fieldset>
  );
}

/**
 * Who is training on a branch that runs on memberships, holding nothing that
 * covers them (spec FP8).
 *
 * Grouped by branch because that is how the work is done: an owner clears one
 * mat, then the next. A gym with nobody uncovered draws nothing at all, since
 * the block exists to name work rather than to report a clean state.
 */
function UncoveredQueue() {
  const trpc = useTRPC();
  const uncovered = useQuery(trpc.accessPlan.uncovered.queryOptions());

  if (uncovered.isPending) return <SkeletonRows rows={2} />;
  if (uncovered.isError)
    return (
      <ErrorState
        label="membership access"
        onRetry={() => void uncovered.refetch()}
      />
    );
  if (uncovered.data.total === 0)
    return (
      <EmptyState title="No missing memberships.">
        Everyone checked has a membership covering their branch.
      </EmptyState>
    );

  return (
    <section className={`${cardClass()} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Missing memberships</h2>
        <span className="text-muted-foreground text-sm">
          {uncovered.data.total === 1
            ? "1 person"
            : `${uncovered.data.total} people`}
        </span>
      </div>
      <p className="text-muted-foreground text-sm">
        These people need a plan that covers the branch where they train.
      </p>
      <ul className="flex flex-col gap-3">
        {uncovered.data.groups.map((g) => (
          <li key={g.entityId} className="flex flex-col gap-1">
            <span className="text-sm font-medium">{g.entityName}</span>
            <span className="text-muted-foreground text-sm">
              {g.people.map((p, i) => (
                <span key={p.personId}>
                  {i > 0 && ", "}
                  <Link
                    href={`/people/${p.personId}`}
                    className="hover:underline"
                  >
                    {p.name}
                  </Link>
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground text-sm">
        Put them on a plan from their own page, or several at once from Members.
      </p>
    </section>
  );
}

/**
 * Finish coverage work a save could not (spec FP8, ADR 129).
 *
 * Adding a branch to a plan now enrols its holders in the same call, so this is
 * a retry rather than a step. It appears only while `gaps.missing` says
 * somebody on the plan still has no membership at a branch it covers.
 *
 * Safe to press again: the run reads the state each time and writes only what
 * is absent, so a second press does nothing and a press after a failure
 * finishes the job.
 */
function Reconcile({ planId, missing }: { planId: string; missing: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const run = useMutation(
    trpc.accessPlan.reconcile.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries();
        if (result.failed.length > 0) {
          toast.error(
            `Could not update ${result.failed
              .map((f) => f.name)
              .join(", ")}. Press again to retry them.`,
          );
          return;
        }
        toast.success(
          result.enrolled.length === 1
            ? "1 person enrolled at a branch they were missing"
            : `${result.enrolled.length} people enrolled at branches they were missing`,
        );
      },
      onError: (e) => toast.error(e.message || "Could not finish it"),
    }),
  );

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={run.isPending}
      onClick={() => run.mutate({ id: planId })}
    >
      {run.isPending
        ? "Finishing…"
        : missing === 1
          ? "Finish 1 enrolment"
          : `Finish ${missing} enrolments`}
    </Button>
  );
}
