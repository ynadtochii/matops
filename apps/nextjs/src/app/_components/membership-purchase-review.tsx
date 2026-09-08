"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import { formatMoney, formatMonth } from "@matops/domain";
import { Button } from "@matops/ui/button";
import { FieldError } from "@matops/ui/field";
import { Label } from "@matops/ui/label";
import { Textarea } from "@matops/ui/textarea";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";
import { cardClass } from "./primitives";
import { SkeletonRows } from "./skeletons";
import { ErrorState } from "./states";

type Purchase = RouterOutputs["membershipPurchase"]["review"][number];

export function MembershipPurchaseReview() {
  const trpc = useTRPC();
  const review = useQuery(trpc.membershipPurchase.review.queryOptions());

  if (review.isPending) return <SkeletonRows rows={2} />;
  if (review.isError)
    return (
      <ErrorState
        label="new membership requests"
        onRetry={() => void review.refetch()}
      />
    );

  const groups = [
    {
      title: "Needs a decision",
      rows: review.data.filter((row) => row.status === "resolution"),
    },
    {
      title: "Declined payments",
      rows: review.data.filter((row) => row.status === "rejected"),
    },
    {
      title: "New membership payments",
      rows: review.data.filter((row) => row.status === "claimed"),
    },
    {
      title: "Free membership requests",
      rows: review.data.filter((row) => row.status === "pending"),
    },
  ].filter((group) => group.rows.length > 0);

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">New membership requests</h2>
        <p className="text-muted-foreground text-sm">
          {groups.length === 0
            ? "No new memberships need approval."
            : "Check each payment before approval. Approval activates the membership and its eligible branches."}
        </p>
      </div>
      {groups.map((group) => (
        <div key={group.title} className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">
            {group.title}
            <span className="text-muted-foreground ml-2 font-normal">
              {group.rows.length}
            </span>
          </h3>
          <ul className="flex flex-col gap-3">
            {group.rows.map((purchase) => (
              <PurchaseRow key={purchase.id} purchase={purchase} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

export function PersonTrainingAccessReview({
  personId,
  provisionalBranches,
}: {
  personId: string;
  provisionalBranches: string[];
}) {
  const trpc = useTRPC();
  const review = useQuery(trpc.membershipPurchase.review.queryOptions());
  const purchase = review.data
    ?.filter((row) => row.personId === personId)
    .sort((a, b) => {
      const priority: Record<string, number> = {
        rejected: 0,
        claimed: 1,
        pending: 2,
        resolution: 3,
      };
      return (priority[a.status] ?? 4) - (priority[b.status] ?? 4);
    })[0];

  if (review.isPending) return <SkeletonRows rows={1} />;
  if (review.isError)
    return (
      <ErrorState
        label="training access"
        onRetry={() => void review.refetch()}
      />
    );
  if (!purchase) return null;

  const branches = purchase.branchNames.join(", ");
  const title =
    purchase.status === "claimed"
      ? provisionalBranches.length > 0
        ? `Provisional access at ${provisionalBranches.join(", ")}`
        : "Payment waiting for confirmation"
      : purchase.status === "rejected"
        ? `Access blocked at ${branches}`
        : purchase.status === "pending"
          ? `Access waiting for approval at ${branches}`
          : `Training access needs a decision at ${branches}`;
  const description =
    purchase.status === "claimed"
      ? "Payment is waiting for confirmation. Booking and check-in access are provisional."
      : purchase.status === "rejected"
        ? "Payment was declined. Only owner approval can restore booking and check-in access."
        : purchase.status === "pending"
          ? "This free membership needs owner approval before access starts."
          : "Resolve this request before training access can start.";

  return (
    <section className="flex flex-col gap-3">
      <div>
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      </div>
      <PurchaseRow purchase={purchase} showPerson={false} />
    </section>
  );
}

function PurchaseRow({
  purchase,
  showPerson = true,
}: {
  purchase: Purchase;
  showPerson?: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const needsResolution = purchase.status === "resolution";
  const invalidate = () => queryClient.invalidateQueries();
  const confirm = useMutation(
    trpc.membershipPurchase.confirm.mutationOptions({
      onSuccess: async (result) => {
        await invalidate();
        if (result.status === "resolution") {
          toast.error(
            result.reason ?? "Membership needs a decision before activation.",
          );
        } else {
          toast.success("Membership approved");
        }
      },
      onError: (failure) => setError(failure.message),
    }),
  );
  const reject = useMutation(
    trpc.membershipPurchase.reject.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success(
          needsResolution
            ? "Request closed. Your resolution is saved."
            : "Payment declined. Booking and check-in are blocked.",
        );
      },
      onError: (failure) => setError(failure.message),
    }),
  );
  const close = useMutation(
    trpc.membershipPurchase.close.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Request closed. Your resolution is saved.");
      },
      onError: (failure) => setError(failure.message),
    }),
  );
  const reviewAction = needsResolution ? close : reject;
  const busy = confirm.isPending || reject.isPending || close.isPending;

  return (
    <li className={`${cardClass()} flex flex-col gap-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {showPerson && (
          <div className="min-w-0">
            <Link
              href={`/people/${purchase.personId}`}
              className="focus-visible:outline-ring font-medium underline-offset-4 hover:underline focus-visible:outline-2"
            >
              {purchase.studentName}
            </Link>
            <p className="text-muted-foreground mt-1 text-sm break-words">
              {purchase.studentEmail}
            </p>
          </div>
        )}
        <span className="text-lg font-semibold tabular-nums">
          {formatMoney(purchase.priceMinor, purchase.currency)}
        </span>
      </div>
      <dl className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Membership</dt>
          <dd className="mt-1 font-medium">{purchase.planName}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">First month</dt>
          <dd className="mt-1">{formatMonth(purchase.startMonth, "UTC")}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Included branches</dt>
          <dd className="mt-1">{purchase.branchNames.join(", ")}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Payment reference</dt>
          <dd className="mt-1 font-mono break-all select-all">
            {purchase.reference}
          </dd>
        </div>
      </dl>
      {purchase.reason && (
        <p className="border-border border-l-2 pl-3 text-sm">
          {purchase.reason}
        </p>
      )}
      {needsResolution && (
        <p className="text-muted-foreground text-sm">
          Access has not been granted. Arrange a refund or another solution with
          the student, then record it here.
        </p>
      )}
      {rejecting ? (
        <form
          className="border-border flex flex-col gap-3 border-t pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            if (!reason.trim()) {
              setError(
                needsResolution
                  ? "Describe how you resolved this request."
                  : "Tell the student why you declined this payment.",
              );
              return;
            }
            reviewAction.mutate({ id: purchase.id, reason: reason.trim() });
          }}
        >
          <Label htmlFor={`purchase-reason-${purchase.id}`}>
            {needsResolution
              ? "How was this resolved?"
              : "Why decline this payment?"}
          </Label>
          <Textarea
            id={`purchase-reason-${purchase.id}`}
            value={reason}
            rows={2}
            maxLength={500}
            autoFocus
            aria-invalid={error ? true : undefined}
            aria-describedby={
              error ? `purchase-error-${purchase.id}` : undefined
            }
            onChange={(event) => {
              setReason(event.target.value);
              setError(null);
            }}
          />
          <p className="text-muted-foreground text-xs">
            {needsResolution
              ? "Closing saves your note. It does not send a refund or grant access."
              : "Declining blocks new booking and check-in. Existing bookings stay for review."}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setRejecting(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="outline" disabled={busy}>
              {reviewAction.isPending
                ? "Saving…"
                : needsResolution
                  ? "Close after resolving"
                  : "Decline payment"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="border-border flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-muted-foreground max-w-sm text-xs">
            {needsResolution
              ? "Close only after you have agreed a solution with the student."
              : purchase.priceMinor === 0
                ? "No payment is required. Approval grants membership access."
                : "Confirm only after you have received the transfer."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => {
                setError(null);
                setRejecting(true);
              }}
            >
              {needsResolution ? "Record resolution" : "Decline"}
            </Button>
            {purchase.status !== "resolution" && (
              <Button
                disabled={busy}
                onClick={() => {
                  setError(null);
                  confirm.mutate({ id: purchase.id });
                }}
              >
                {confirm.isPending
                  ? "Approving…"
                  : purchase.priceMinor === 0
                    ? "Approve membership"
                    : "Confirm payment"}
              </Button>
            )}
          </div>
        </div>
      )}
      {error && (
        <FieldError id={`purchase-error-${purchase.id}`}>{error}</FieldError>
      )}
    </li>
  );
}
