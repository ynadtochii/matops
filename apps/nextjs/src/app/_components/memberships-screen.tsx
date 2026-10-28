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
} from "@matops/domain";
import { cn } from "@matops/ui";
import { Badge } from "@matops/ui/badge";
import { Button } from "@matops/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@matops/ui/dialog";
import { FieldError } from "@matops/ui/field";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { FOCUS_RING } from "@matops/ui/motion";
import { Textarea } from "@matops/ui/textarea";
import { toast } from "@matops/ui/toast";
import {
  CreateAccessPlanSchema,
  SetAccessPlanPriceSchema,
  SetPlanPaymentLinkSchema,
} from "@matops/validators";

import { dateFmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { useAnyBranchTakesPayment, useOrganization } from "./entity";
import { PageHeader } from "./page-header";
import { ENTER, LIST, SectionHeading, stagger } from "./primitives";
import { SkeletonRows } from "./skeletons";
import { EmptyState, ErrorState } from "./states";
import { Tabs } from "./tabs";

type Plan = RouterOutputs["accessPlan"]["list"][number];

/**
 * The organization's membership plans (ADR 126).
 *
 * It sits outside a branch on purpose: a plan belongs to the owner group and
 * can cover more than one branch, so there is no single branch it could live
 * under. Assigning one to a person happens on
 * that person's member profile inside a branch, which is where an owner already
 * is when they think about it.
 */
type MembershipTab = "payments" | "access" | "plans";

export function MembershipsScreen() {
  const { entities, canRunOrganization, role } = useOrganization();
  const inUse = useAnyBranchTakesPayment();
  const readable = canRunOrganization;
  const trpc = useTRPC();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [tab, setTab] = useState<MembershipTab>(
    tabParam === "access" || tabParam === "plans" ? tabParam : "payments",
  );
  const plans = useQuery({
    ...trpc.accessPlan.list.queryOptions(),
    enabled: readable && tab === "plans",
  });
  // The same three queries the sections below make, read here for the tab
  // counts. One query key means one request, so a tab wearing its number costs
  // nothing on the tab that is already open.
  const claims = useQuery({
    ...trpc.accessPlan.claims.queryOptions(),
    enabled: readable,
  });
  const uncovered = useQuery({
    ...trpc.accessPlan.uncovered.queryOptions(),
    enabled: readable,
  });
  const review = useQuery({
    ...trpc.accessPlan.bookingsToReview.queryOptions({ limit: 50 }),
    enabled: readable,
  });
  const [adding, setAdding] = useState(false);

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
      <PageHeader
        title="Memberships"
        action={
          tab === "plans" && (
            <Button size="sm" onClick={() => setAdding(true)}>
              New plan
            </Button>
          )
        }
      />

      {!inUse && (
        <p className="text-muted-foreground text-sm">
          Membership payments are off. Students do not see plans or months, and
          they book without paying. Turn payments on in Settings when you are
          ready.
        </p>
      )}

      <Tabs
        label="Membership views"
        value={tab}
        onChange={setTab}
        tabs={[
          {
            id: "payments",
            label: "Payments",
            count: claims.data?.length ?? 0,
          },
          {
            id: "access",
            label: "Needs action",
            count:
              (uncovered.data?.total ?? 0) + (review.data?.items.length ?? 0),
          },
          { id: "plans", label: "Plans" },
        ]}
      />

      {tab === "payments" && (
        <div className="flex min-w-0 flex-col gap-8">
          <CardPaymentsToCheck />
          <ClaimsWaiting />
          <MonthBoard />
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
          {plans.isPending ? (
            <SkeletonRows rows={3} inList />
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
            <section className="flex min-w-0 flex-col gap-4">
              <SectionHeading
                action={
                  <span className="text-muted-foreground shrink-0 text-sm">
                    Assign a plan from a person&apos;s profile.
                  </span>
                }
              >
                Plans
              </SectionHeading>
              <ul className={LIST}>
                {plans.data.map((p, i) => (
                  <li key={p.id} style={stagger(i)} className={ENTER}>
                    <PlanCard plan={p} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {role === "owner" && entities[0] && (
            <p className="text-muted-foreground border-border border-t pt-4 text-sm">
              Manage payment deadlines, time zone, and bank details in{" "}
              <Link
                href={entityHref(entities[0].id, "/settings")}
                className={cn(
                  "rounded-sm underline underline-offset-4",
                  FOCUS_RING,
                )}
              >
                Settings
              </Link>
              .
            </p>
          )}
        </div>
      )}

      <NewPlanDialog open={adding} onOpenChange={setAdding} />
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
/**
 * Card payments the gym's Stripe reported that MatOps could not match to a
 * month on its own (ADR 157): no reference, a different amount, a rejected
 * month, or a month already paid.
 */
function CardPaymentsToCheck() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const rows = useQuery(trpc.cardPayment.toReview.queryOptions());
  const dismiss = useMutation(
    trpc.cardPayment.dismiss.mutationOptions({
      onSuccess: () =>
        queryClient.invalidateQueries(trpc.cardPayment.toReview.pathFilter()),
      onError: (e) =>
        toast.error(e.message || "Couldn't hide that payment. Try again."),
    }),
  );

  if (rows.isPending || rows.isError || rows.data.length === 0) return null;

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <SectionHeading count={rows.data.length}>
        Card payments to check
      </SectionHeading>
      <p className="text-muted-foreground -mt-2 text-sm">
        Your Stripe reported these payments, but MatOps did not mark a month
        paid. Check them in Stripe, mark the month by hand if needed, then hide
        them.
      </p>
      <ul className={LIST}>
        {rows.data.map((p) => (
          <li
            key={p.id}
            className="flex min-h-11 flex-wrap items-center gap-3 px-4 py-3"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-medium">
                {p.name ?? "Unknown student"}
                {" · "}
                {formatMoney(p.amountMinor, p.currency)}
                {p.month ? ` · ${formatMonth(p.month, "UTC")}` : ""}
              </span>
              <span className="text-muted-foreground text-sm">
                {p.outcome === "paid_twice" && <Badge>Paid twice</Badge>}{" "}
                {p.reason}
              </span>
              <span className="text-muted-foreground text-xs tabular-nums">
                {dateFmt.format(new Date(p.createdAt))}
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              busy={dismiss.isPending && dismiss.variables.id === p.id}
              onClick={() => dismiss.mutate({ id: p.id })}
            >
              Hide
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

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
    toast.error(
      e.message || "Couldn't finish that. Check your connection and try again.",
    );

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

  if (claims.isPending) return <SkeletonRows rows={2} inList />;
  if (claims.isError)
    return (
      <ErrorState
        label="payment claims"
        onRetry={() => void claims.refetch()}
      />
    );
  const rows = claims.data;
  // The usual state of this section is empty, and an empty heading above the
  // month board would push the work down the page every day to say nothing.
  // The tab carries the count, so silence here is the honest shape.
  if (rows.length === 0) return null;

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <SectionHeading count={rows.length}>Payment claims</SectionHeading>
      <p className="text-muted-foreground -mt-2 text-sm">
        Members who say they have paid. Confirm each one against your bank.
      </p>
      <ul className={LIST}>
        {rows.map((c) => {
          const busy =
            (confirm.isPending &&
              confirm.variables.assignmentId === c.assignmentId) ||
            (reject.isPending &&
              reject.variables.assignmentId === c.assignmentId);
          return (
            <li
              key={`${c.assignmentId}:${c.month}`}
              className="flex min-h-11 flex-wrap items-center gap-3 px-4 py-3"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-medium">{c.name}</span>
                <span className="text-muted-foreground truncate text-sm">
                  {c.planName} · {c.monthLabel}
                </span>
                {c.reportedAt && (
                  <span className="text-muted-foreground text-xs tabular-nums">
                    Said they paid on {dateFmt.format(new Date(c.reportedAt))}
                  </span>
                )}
              </div>
              <Button
                size="sm"
                busy={busy}
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
    </section>
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
function MonthBoard() {
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
      onError: (e) =>
        toast.error(e.message || "Couldn't record that. Try again."),
    }),
  );

  if (board.isPending) return <SkeletonRows rows={3} inList />;
  if (board.isError) {
    return (
      <ErrorState label="this month" onRetry={() => void board.refetch()} />
    );
  }

  const rows = [...board.data.rows].sort((a, b) =>
    a.paid === b.paid ? a.name.localeCompare(b.name) : a.paid ? 1 : -1,
  );

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <SectionHeading
        action={
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {rows.filter((r) => r.paymentRequired && r.paid).length} of{" "}
            {rows.filter((r) => r.paymentRequired).length} paid
            {rows.some((r) => !r.paymentRequired) &&
              ` · ${rows.filter((r) => !r.paymentRequired).length} free`}
            {board.data.unpriced > 0 &&
              ` · ${board.data.unpriced} with no price`}
          </span>
        }
      >
        {board.data.monthLabel}
      </SectionHeading>

      {rows.length === 0 ? (
        <EmptyState title="Nobody holds a membership yet.">
          Give somebody one on their member profile, in any branch.
        </EmptyState>
      ) : (
        <ul className={LIST}>
          {rows.map((r) => (
            <li
              key={r.assignmentId}
              className="flex min-h-11 flex-wrap items-center gap-3 px-4 py-3"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-medium">{r.name}</span>
                <span className="text-muted-foreground truncate text-sm tabular-nums">
                  {r.planName}
                  {/* What THIS month costs, so the owner reading a bank
                      statement is comparing against the right figure. */}
                  {r.amount
                    ? ` · ${formatMoney(r.amount.priceMinor, r.amount.currency)}`
                    : " · no price yet"}
                </span>
                {!r.paid && r.paymentRequired && (
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      r.overdue ? "text-error-text" : "text-muted-foreground",
                    )}
                  >
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
                  busy={
                    mark.isPending &&
                    mark.variables.assignmentId === r.assignmentId
                  }
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
    </section>
  );
}

function BookingAccessQueue() {
  const trpc = useTRPC();
  const review = useQuery(
    trpc.accessPlan.bookingsToReview.queryOptions({ limit: 50 }),
  );
  if (review.isPending) return <SkeletonRows rows={2} inList />;
  if (review.isError)
    return (
      <ErrorState
        label="bookings that need attention"
        onRetry={() => void review.refetch()}
      />
    );
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <SectionHeading count={review.data.items.length}>
        Bookings that need attention
      </SectionHeading>
      <p className="text-muted-foreground -mt-2 text-sm">
        These people have booked a class their membership no longer covers.
      </p>
      {review.data.items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Every upcoming booking is covered by a membership.
        </p>
      ) : (
        <ul className={LIST}>
          {review.data.items.map((booking) => (
            <li
              key={booking.participationId}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-foreground text-sm font-medium">
                  {booking.name}
                </span>
                <span className="text-muted-foreground text-sm wrap-anywhere tabular-nums">
                  {booking.title} · {booking.entityName} ·{" "}
                  {dateFmt.format(new Date(booking.startsAt))}
                </span>
                <span className="text-foreground-secondary text-sm">
                  {booking.reason === "payment-declined"
                    ? "Payment declined. Owner approval is required."
                    : booking.reason === "suspended"
                      ? "Branch access is paused."
                      : booking.reason === "membership-inactive"
                        ? "Membership is paused or ended."
                        : "No active membership covers this branch."}
                </span>
              </div>
              <div className="flex flex-wrap gap-4">
                <Link
                  href={entityHref(
                    booking.entityId,
                    `/class/${booking.classId}?accessPerson=${encodeURIComponent(booking.name)}&accessReason=${booking.reason}`,
                  )}
                  className={cn(
                    "text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center rounded-sm text-sm underline-offset-4 transition-colors hover:underline motion-reduce:transition-none sm:min-h-8",
                    FOCUS_RING,
                  )}
                >
                  Open roster
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
      {review.data.more && (
        <p className="text-muted-foreground text-sm">
          Showing the first 50. Fix these to see the rest.
        </p>
      )}
    </section>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
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
  const [linking, setLinking] = useState(false);

  return (
    <div className="flex flex-wrap gap-3 px-4 py-3">
      <PriceDialog plan={plan} open={pricing} onOpenChange={setPricing} />
      {linking && <PaymentLinkDialog plan={plan} onOpenChange={setLinking} />}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 font-medium">
          {plan.name}
          {plan.archived && <Badge>Archived</Badge>}
        </span>
        <span className="text-muted-foreground text-sm tabular-nums">
          {plan.priceMinor !== null && plan.currency
            ? `${formatMoney(plan.priceMinor, plan.currency)} a month`
            : "No price yet"}
        </span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {plan.activeHolders === 1
            ? "1 member holds it"
            : `${plan.activeHolders} members hold it`}
          {plan.paymentLinkUrl ? " · Card payment link set" : ""}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {!plan.archived && plan.gaps.missing > 0 && (
          <Reconcile planId={plan.id} missing={plan.gaps.missing} />
        )}
        {!plan.archived && (
          <Button size="sm" variant="outline" onClick={() => setPricing(true)}>
            {plan.priceMinor === null ? "Set price" : "Change price"}
          </Button>
        )}
        {!plan.archived && plan.priceMinor !== null && (
          <Button size="sm" variant="outline" onClick={() => setLinking(true)}>
            Payment link
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          busy={archive.isPending}
          disabled={archive.isPending}
          onClick={() =>
            archive.mutate({ id: plan.id, archived: !plan.archived })
          }
        >
          {plan.archived ? "Restore" : "Archive"}
        </Button>
      </div>
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
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation(
    trpc.accessPlan.setPrice.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.accessPlan.list.pathFilter());
        setError(null);
        onOpenChange(false);
        toast.success("Price saved");
      },
      onError: (e) =>
        toast.error(e.message || "Couldn't save that price. Try again."),
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
              paymentLinkUrl: link.trim() === "" ? undefined : link,
            });
            if (!parsed.success) {
              setError(
                parsed.error.issues.some((i) => i.path[0] === "paymentLinkUrl")
                  ? "Paste a Stripe payment link that starts with https://buy.stripe.com/"
                  : "Give the price as a number, like 45 or 45.50.",
              );
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
          <div className="flex flex-col gap-2">
            <Label htmlFor={`price-link-${plan.id}`}>
              Stripe payment link for this price (optional)
            </Label>
            {plan.paymentLinkUrl && (
              <p className="text-muted-foreground text-sm">
                This plan's payment link charges the current price. Add a new
                link with the new amount, or Pay by card disappears when the new
                price starts.
              </p>
            )}
            <Input
              id={`price-link-${plan.id}`}
              type="url"
              value={link}
              placeholder="https://buy.stripe.com/…"
              onChange={(e) => setLink(e.target.value)}
            />
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
            <Button
              type="submit"
              busy={save.isPending}
              disabled={save.isPending || !earliest}
            >
              Save price
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The gym's own Stripe Payment Link for the price members pay this month
 * (ADR 156). Payments land in the gym's Stripe account, and staff still confirm
 * the month with Mark paid.
 */
function PaymentLinkDialog({
  plan,
  onOpenChange,
}: {
  plan: Plan;
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [link, setLink] = useState(plan.paymentLinkUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const save = useMutation(
    trpc.accessPlan.setPaymentLink.mutationOptions({
      onSuccess: async (_, input) => {
        await queryClient.invalidateQueries(trpc.accessPlan.pathFilter());
        onOpenChange(false);
        toast.success(
          input.paymentLinkUrl ? "Payment link saved" : "Payment link removed",
        );
      },
      onError: (e) =>
        toast.error(e.message || "Couldn't save that link. Try again."),
    }),
  );
  const submit = (value: string | null) => {
    const parsed = SetPlanPaymentLinkSchema.safeParse({
      planId: plan.id,
      paymentLinkUrl: value,
    });
    if (!parsed.success) {
      setError(
        "Paste a Stripe payment link that starts with https://buy.stripe.com/",
      );
      return;
    }
    setError(null);
    save.mutate(parsed.data);
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Payment link for {plan.name}</DialogTitle>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit(link.trim() === "" ? null : link);
          }}
        >
          <ol className="text-muted-foreground flex list-decimal flex-col gap-1 pl-5 text-sm">
            <li>
              In Stripe, create a Payment Link with a one-time price of{" "}
              <strong className="text-foreground">
                {plan.currentAmount
                  ? formatMoney(
                      plan.currentAmount.priceMinor,
                      plan.currentAmount.currency,
                    )
                  : "this month's price"}
              </strong>
              . The amount must match exactly, or payments wait for you to check
              them.
            </li>
            <li>Copy the link Stripe gives you and paste it below.</li>
          </ol>
          <Button size="sm" variant="outline" className="self-start" asChild>
            <a
              href="https://dashboard.stripe.com/payment-links/create"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Stripe Payment Links
            </a>
          </Button>
          <p className="text-muted-foreground text-sm">
            Students then see Pay by card for this month, and the money goes to
            your Stripe account. With card payments set up in Settings, a paid
            month is marked paid on its own; otherwise confirm it with Mark
            paid.
          </p>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`link-${plan.id}`}>Stripe payment link</Label>
            <Input
              id={`link-${plan.id}`}
              type="url"
              value={link}
              placeholder="https://buy.stripe.com/…"
              onChange={(e) => setLink(e.target.value)}
            />
          </div>
          {error && <FieldError>{error}</FieldError>}
          <div className="flex flex-wrap justify-end gap-2">
            {plan.paymentLinkUrl && (
              <Button
                type="button"
                variant="outline"
                disabled={save.isPending}
                onClick={() => submit(null)}
              >
                Remove link
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
              busy={save.isPending}
              disabled={save.isPending}
            >
              Save link
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
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation(
    trpc.accessPlan.create.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.accessPlan.list.pathFilter());
        setName("");
        setDescription("");
        setPrice("");
        setError(null);
        onOpenChange(false);
      },
      onError: (e) =>
        toast.error(e.message || "Couldn't add that plan. Try again."),
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
              entityIds: entities.map((e) => e.id),
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
          <div className="flex justify-end">
            <Button
              type="submit"
              busy={create.isPending}
              disabled={create.isPending}
            >
              Add plan
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
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

  if (uncovered.isPending) return <SkeletonRows rows={2} inList />;
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
    <section className="flex min-w-0 flex-col gap-4">
      <SectionHeading count={uncovered.data.total}>
        Missing memberships
      </SectionHeading>
      <p className="text-muted-foreground -mt-2 text-sm">
        These people need a plan that covers the branch where they train.
      </p>
      <ul className={LIST}>
        {uncovered.data.groups.map((g) => (
          <li key={g.entityId} className="flex flex-col gap-0.5 px-4 py-3">
            <span className="text-sm font-medium">{g.entityName}</span>
            <span className="text-muted-foreground text-sm">
              {g.people.map((p, i) => (
                <span key={p.personId}>
                  {i > 0 && ", "}
                  {p.name}
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
            `Couldn't update ${result.failed
              .map((f) => f.name)
              .join(", ")}. Try again.`,
          );
          return;
        }
        toast.success(
          result.enrolled.length === 1
            ? "1 person enrolled at a branch they were missing"
            : `${result.enrolled.length} people enrolled at branches they were missing`,
        );
      },
      onError: (e) =>
        toast.error(e.message || "Couldn't finish it. Try again."),
    }),
  );

  return (
    <Button
      size="sm"
      variant="outline"
      busy={run.isPending}
      onClick={() => run.mutate({ id: planId })}
    >
      {missing === 1 ? "Finish 1 enrolment" : `Finish ${missing} enrolments`}
    </Button>
  );
}
