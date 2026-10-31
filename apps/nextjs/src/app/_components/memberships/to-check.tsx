"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { entityHref, formatMoney, formatMonth } from "@matops/domain";
import { cn } from "@matops/ui";
import { Badge } from "@matops/ui/badge";
import { Button } from "@matops/ui/button";
import { FOCUS_RING } from "@matops/ui/motion";
import { toast } from "@matops/ui/toast";

import { dateFmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { Eyebrow, LIST, SectionHeading } from "../primitives";
import { SkeletonRows } from "../skeletons";
import { EmptyState, ErrorState } from "../states";

export function useToCheckCount() {
  const trpc = useTRPC();
  const card = useQuery(trpc.cardPayment.toReview.queryOptions());
  const claims = useQuery(trpc.accessPlan.claims.queryOptions());
  const uncovered = useQuery(trpc.accessPlan.uncovered.queryOptions());
  const review = useQuery(
    trpc.accessPlan.bookingsToReview.queryOptions({ limit: 50 }),
  );
  const money = (card.data?.length ?? 0) + (claims.data?.length ?? 0);
  const access =
    (uncovered.data?.total ?? 0) + (review.data?.items.length ?? 0);
  return {
    money,
    access,
    moneyLoaded: card.isSuccess && claims.isSuccess,
    accessLoaded: uncovered.isSuccess && review.isSuccess,
  };
}

export function ToCheckTab() {
  const { money, access, moneyLoaded, accessLoaded } = useToCheckCount();
  const showMoney = !moneyLoaded || money > 0;
  const showAccess = !accessLoaded || access > 0;

  if (!showMoney && !showAccess) {
    return (
      <EmptyState title="Nothing to check.">
        Payments to confirm and students who need a plan show up here.
      </EmptyState>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-10">
      {showMoney && (
        <Group title="Money">
          <ClaimsWaiting />
          <CardPaymentsToCheck />
        </Group>
      )}
      {showAccess && (
        <Group title="Access">
          <UncoveredQueue />
          <BookingAccessQueue />
        </Group>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <Eyebrow>{title}</Eyebrow>
      {children}
    </div>
  );
}

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
        Members who say they have paid. Confirm each one against your bank, or
        with the person who took the cash.
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
                {(c.methodLabel ?? c.cashPaidToName) && (
                  <span className="text-foreground-secondary text-sm">
                    {c.cashPaidToName
                      ? `Cash, paid to ${c.cashPaidToName}${
                          c.cashPaidOn
                            ? ` on ${dateFmt.format(new Date(`${c.cashPaidOn}T12:00:00`))}`
                            : ""
                        }`
                      : c.methodLabel}
                  </span>
                )}
                {c.hasProof && (
                  <ProofLink assignmentId={c.assignmentId} month={c.month} />
                )}
                {c.note && (
                  <span className="text-muted-foreground text-sm whitespace-pre-wrap">
                    “{c.note}”
                  </span>
                )}
                {c.reportedAt && !c.cashPaidOn && (
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
                {c.cashPaidToName ? "Cash received" : "Confirm"}
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

function ProofLink({
  assignmentId,
  month,
}: {
  assignmentId: string;
  month: string;
}) {
  const trpc = useTRPC();
  const open = useMutation(trpc.accessPlan.proofUrl.mutationOptions());
  return (
    <Button
      size="sm"
      variant="ghost"
      className="self-start px-0"
      busy={open.isPending}
      onClick={() => {
        const tab = window.open("about:blank", "_blank");
        if (tab) tab.opener = null;
        open.mutate(
          { assignmentId, month },
          {
            onSuccess: ({ url }) => {
              if (tab) tab.location.href = url;
              else window.location.assign(url);
            },
            onError: (e) => {
              tab?.close();
              toast.error(e.message || "Couldn't open the proof. Try again.");
            },
          },
        );
      }}
    >
      View proof
    </Button>
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
      {review.data.items.length > 0 && (
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
  if (uncovered.data.total === 0) return null;

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
        They see a banner asking them to choose a plan. You can also assign one
        from their profile.
      </p>
    </section>
  );
}
