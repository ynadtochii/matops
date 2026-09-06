"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import { formatMoney, formatMonth } from "@matops/domain";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import { CopyButton } from "@matops/ui/copy-button";
import { Label } from "@matops/ui/label";
import { Select } from "@matops/ui/select";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";
import { useEntity, useEntityHref } from "./entity";
import { cardClass, SectionHeading } from "./primitives";
import { SkeletonRows } from "./skeletons";
import { EmptyState, ErrorState } from "./states";

type Purchase =
  RouterOutputs["membershipPurchase"]["mine"]["purchases"][number];

function monthLabel(month: string) {
  return formatMonth(month, "UTC");
}

export function MembershipSelection() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const academy = useEntity();
  const [start, setStart] = useState<"current" | "next">("current");
  const mine = useQuery({
    ...trpc.membershipPurchase.mine.queryOptions(),
    refetchInterval: (query) =>
      query.state.data?.purchases.some((p) =>
        ["pending", "claimed", "rejected", "resolution"].includes(p.status),
      )
        ? 10000
        : false,
  });
  const catalog = useQuery({
    ...trpc.membershipPurchase.catalog.queryOptions({ start }),
    refetchInterval: academy.status === "pending" ? 10000 : false,
  });
  const previousStatus = useRef(academy.status);
  useEffect(() => {
    if (previousStatus.current === academy.status) return;
    previousStatus.current = academy.status;
    void Promise.all([
      queryClient.invalidateQueries(
        trpc.membershipPurchase.catalog.pathFilter(),
      ),
      queryClient.invalidateQueries(trpc.booking.access.pathFilter()),
      queryClient.invalidateQueries(trpc.entity.pathFilter()),
    ]);
  }, [academy.status, queryClient, trpc]);
  const seenConfirmed = useRef(new Set<string>());
  useEffect(() => {
    const fresh =
      mine.data?.purchases.filter(
        (p) => p.status === "confirmed" && !seenConfirmed.current.has(p.id),
      ) ?? [];
    if (!fresh.length) return;
    fresh.forEach((p) => seenConfirmed.current.add(p.id));
    void Promise.all([
      queryClient.invalidateQueries(trpc.entity.pathFilter()),
      queryClient.invalidateQueries(trpc.academy.pathFilter()),
      queryClient.invalidateQueries(trpc.accessPlan.pathFilter()),
      queryClient.invalidateQueries(trpc.booking.pathFilter()),
      queryClient.invalidateQueries(
        trpc.membershipPurchase.catalog.pathFilter(),
      ),
    ]);
  }, [mine.data, queryClient, trpc]);

  const select = useMutation(
    trpc.membershipPurchase.select.mutationOptions({
      onError: () => {
        void catalog.refetch();
      },
      onSuccess: async () => {
        await queryClient.invalidateQueries(
          trpc.membershipPurchase.pathFilter(),
        );
        toast.success("Membership selected");
      },
    }),
  );

  if (mine.isPending) return <SkeletonRows rows={2} />;
  if (mine.isError) {
    return (
      <ErrorState
        label="available memberships"
        onRetry={() => {
          void mine.refetch();
          void catalog.refetch();
        }}
      />
    );
  }

  const purchase = mine.data.purchases.find((p) =>
    ["pending", "claimed", "rejected", "resolution"].includes(p.status),
  );
  const confirmed = mine.data.purchases.find((p) => p.status === "confirmed");
  const closed =
    mine.data.purchases[0]?.status === "cancelled"
      ? mine.data.purchases[0]
      : undefined;

  if (purchase) {
    return (
      <PurchaseDetails
        purchase={purchase}
        bankDetails={mine.data.bankDetails}
        currentMonth={mine.data.currentMonth}
      />
    );
  }

  if (catalog.isPending) return <SkeletonRows rows={2} />;
  if (catalog.isError)
    return (
      <ErrorState
        label="available memberships"
        onRetry={() => void catalog.refetch()}
      />
    );

  return (
    <section className="space-y-5" aria-label="Choose a membership">
      {closed?.reason && (
        <div role="status" className="border-border rounded-lg border p-4">
          <p className="font-medium">Your previous request was closed</p>
          <p className="text-muted-foreground mt-1 text-sm">
            {closed.planName}: {closed.reason}
          </p>
        </div>
      )}
      {confirmed && (
        <PurchaseDetails
          purchase={confirmed}
          bankDetails={mine.data.bankDetails}
          currentMonth={mine.data.currentMonth}
        />
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-xl space-y-2">
          <SectionHeading>
            {confirmed ? "Available memberships" : "Choose your membership"}
          </SectionHeading>
          <p className="text-muted-foreground text-sm">
            Plans for {academy.name}, including memberships that cover other
            branches. Your gym confirms payment before booking opens.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="membership-start">Start month</Label>
          <Select
            id="membership-start"
            value={start}
            disabled={select.isPending}
            onChange={(event) =>
              setStart(event.target.value === "next" ? "next" : "current")
            }
          >
            <option value="current">This month</option>
            <option value="next">Next month</option>
          </Select>
        </div>
      </div>
      {!catalog.data.canSelect && (
        <p
          role="status"
          className="border-border bg-card rounded-lg border p-4 text-sm"
        >
          You can compare memberships now. Your branch must approve your join
          request before you choose and pay.
        </p>
      )}
      <p className="text-muted-foreground text-sm">
        {monthLabel(catalog.data.month)} is billed as a full calendar month,
        even if you start partway through it. The next monthly payment is for{" "}
        {monthLabel(catalog.data.nextMonth)}.
      </p>
      {select.isError && (
        <p role="alert" className="text-error text-sm">
          {select.error.message}
        </p>
      )}
      {catalog.data.plans.length === 0 ? (
        <EmptyState title="No memberships available to choose yet">
          Your gym needs to publish a plan covering this branch. You can keep
          browsing the schedule while you wait.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 lg:grid-cols-2">
          {catalog.data.plans.map((plan) => (
            <li
              key={plan.id}
              className={`${cardClass()} flex min-w-0 flex-col gap-4`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="font-mono text-lg tabular-nums">
                  {!plan.currency
                    ? "Price not set"
                    : plan.priceMinor === 0
                      ? "Free"
                      : formatMoney(plan.priceMinor, plan.currency)}
                  {plan.priceMinor > 0 && (
                    <span className="text-muted-foreground font-sans text-sm">
                      {" "}
                      / month
                    </span>
                  )}
                </p>
              </div>
              {plan.description && (
                <p className="text-muted-foreground text-sm whitespace-pre-wrap">
                  {plan.description}
                </p>
              )}
              <div>
                <p className="text-muted-foreground mb-2 text-sm">
                  Included branches
                </p>
                <ul className="flex flex-wrap gap-2">
                  {plan.branches.map((branch) => (
                    <li
                      key={branch.id}
                      className="border-border rounded-md border px-2 py-1 text-sm"
                    >
                      {branch.name}
                    </li>
                  ))}
                </ul>
              </div>
              {plan.unavailableReason && (
                <p className="text-muted-foreground text-sm">
                  {plan.unavailableReason}
                </p>
              )}
              <ConfirmDialog
                title={`Choose ${plan.name}?`}
                description={`${plan.priceMinor === 0 ? "Free membership" : formatMoney(plan.priceMinor, plan.currency)} for ${monthLabel(catalog.data.month)}. Includes ${plan.branches.map((branch) => branch.name).join(", ")}. ${plan.priceMinor === 0 ? "Your gym must approve activation." : "Pay by bank transfer. Access begins after your gym confirms payment and the selected month begins."}`}
                confirmLabel="Choose membership"
                variant="primary"
                onConfirm={async () => {
                  await select.mutateAsync({
                    planId: plan.id,
                    start,
                    version: plan.version,
                  });
                }}
                trigger={
                  <Button
                    className="mt-auto self-start"
                    disabled={
                      !catalog.data.canSelect ||
                      !!plan.unavailableReason ||
                      select.isPending
                    }
                    busy={
                      select.isPending && select.variables.planId === plan.id
                    }
                  >
                    Choose plan
                  </Button>
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PurchaseDetails({
  purchase,
  bankDetails,
  currentMonth,
}: {
  purchase: Purchase;
  bankDetails: string;
  currentMonth: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const href = useEntityHref();
  const refresh = () =>
    queryClient.invalidateQueries(trpc.membershipPurchase.pathFilter());
  const claim = useMutation(
    trpc.membershipPurchase.claim.mutationOptions({ onSuccess: refresh }),
  );
  const cancel = useMutation(
    trpc.membershipPurchase.cancel.mutationOptions({ onSuccess: refresh }),
  );
  const confirmed = purchase.status === "confirmed";
  const expired = purchase.startMonth < currentMonth;
  const waiting =
    purchase.status === "claimed" ||
    (purchase.status === "pending" && purchase.priceMinor === 0);
  const canClaim =
    purchase.priceMinor > 0 &&
    ["pending", "rejected"].includes(purchase.status);
  const error = claim.error ?? cancel.error;
  return (
    <section className="space-y-5" aria-label="Selected membership">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-muted-foreground text-sm">Your selection</p>
          <h2 className="text-xl font-semibold">{purchase.planName}</h2>
          <p className="text-muted-foreground text-sm">
            {purchase.branchNames.join(" · ")}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-xl tabular-nums">
            {purchase.priceMinor === 0
              ? "Free"
              : formatMoney(purchase.priceMinor, purchase.currency)}
          </p>
          <p className="text-muted-foreground text-sm">
            {monthLabel(purchase.startMonth)}
          </p>
        </div>
      </div>
      <div
        role="status"
        className="border-brand/25 bg-brand-wash space-y-2 rounded-lg border p-4"
      >
        <h3 className="font-semibold">
          {confirmed
            ? "Membership confirmed"
            : purchase.status === "resolution"
              ? "Your gym needs to review this payment"
              : waiting
                ? "Waiting for your gym"
                : purchase.status === "rejected"
                  ? "Payment needs your attention"
                  : expired
                    ? "This selection is for a past month"
                    : "Next: send your bank transfer"}
        </h3>
        <p className="text-muted-foreground text-sm">
          {confirmed
            ? `Your membership starts in ${monthLabel(purchase.startMonth)}. Included branches are available in the branch picker. Booking follows the membership dates and each branch’s access rules.`
            : waiting
              ? purchase.priceMinor === 0
                ? "Your gym will approve this free membership. You can browse while you wait."
                : "Your payment claim is submitted. You can browse while your gym confirms it. No need to send it again."
              : purchase.status === "resolution"
                ? "Your gym has a payment or access issue to resolve. Contact them before sending more money."
                : "Booking stays locked until your gym confirms payment. You can still browse the schedule."}
        </p>
        {purchase.reason && <p className="text-sm">{purchase.reason}</p>}
        {confirmed && (
          <Button asChild variant="outline" size="sm">
            <Link href={href("/")}>View schedule</Link>
          </Button>
        )}
      </div>
      {expired && canClaim && (
        <p role="status" className="text-warning text-sm">
          Do not send a new transfer for this selection. Choose a different plan
          if you have not paid. If you already transferred, submit your claim so
          the gym can resolve it.
        </p>
      )}
      {purchase.priceMinor === 0 && purchase.status === "rejected" && (
        <Button
          onClick={() => claim.mutate({ id: purchase.id })}
          disabled={claim.isPending}
          busy={claim.isPending}
        >
          Resubmit request
        </Button>
      )}
      {canClaim && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.7fr)]">
          <div className={`${cardClass()} space-y-4`}>
            <h3 className="font-semibold">
              {expired ? "Payment already sent" : "1. Send the transfer"}
            </h3>
            <p className="text-muted-foreground text-sm">
              {expired
                ? "Only submit a claim if you already paid. Your gym will agree the correct dates or a refund with you."
                : "Use your bank app to pay the amount shown above. Include this reference so your gym can match the payment."}
            </p>
            <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <div>
                <p className="text-muted-foreground text-sm">
                  Payment reference
                </p>
                <p className="mt-1 font-mono break-all">{purchase.reference}</p>
              </div>
              <CopyButton value={purchase.reference} label="Copy reference" />
            </div>
            <div className="border-border space-y-3 border-t pt-4">
              <h3 className="font-semibold">2. Tell your gym</h3>
              <ConfirmDialog
                title="Have you sent the transfer?"
                description="This sends a payment claim to your gym. They will check the transfer before activating your membership."
                confirmLabel="Yes, I paid"
                variant="primary"
                onConfirm={async () => {
                  await claim.mutateAsync({ id: purchase.id });
                }}
                trigger={
                  <Button
                    busy={claim.isPending}
                    disabled={claim.isPending || cancel.isPending}
                  >
                    I paid
                  </Button>
                }
              />
            </div>
          </div>
          <aside className="space-y-3">
            <h3 className="font-semibold">Bank details</h3>
            {bankDetails && !expired ? (
              <>
                <p className="text-muted-foreground text-sm break-words whitespace-pre-wrap">
                  {bankDetails}
                </p>
                <CopyButton value={bankDetails} label="Copy bank details" />
              </>
            ) : (
              <p className="text-muted-foreground text-sm">
                Contact your gym before sending a transfer.
              </p>
            )}
          </aside>
        </div>
      )}
      {(waiting || purchase.status === "resolution") && (
        <p className="text-muted-foreground text-sm">
          Reference:{" "}
          <span className="font-mono break-all">{purchase.reference}</span>
        </p>
      )}
      {error && (
        <p role="alert" className="text-error text-sm">
          {error.message}
        </p>
      )}
      {((purchase.status === "pending" && !purchase.claimedAt) ||
        (purchase.status === "rejected" && purchase.priceMinor === 0)) && (
        <ConfirmDialog
          title="Cancel this selection?"
          description={
            purchase.priceMinor === 0
              ? "This withdraws your free membership request. You can choose another plan."
              : "Only cancel if you have not sent a bank transfer. If you already paid, submit your claim or contact your gym."
          }
          confirmLabel={
            purchase.priceMinor === 0
              ? "Cancel selection"
              : "I have not paid, cancel selection"
          }
          onConfirm={async () => {
            await cancel.mutateAsync({ id: purchase.id });
          }}
          trigger={
            <Button
              variant="ghost"
              size="sm"
              disabled={cancel.isPending || claim.isPending}
            >
              Choose a different plan
            </Button>
          }
        />
      )}
    </section>
  );
}
