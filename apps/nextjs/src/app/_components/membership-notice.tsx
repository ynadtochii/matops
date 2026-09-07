"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { formatMoney } from "@matops/domain";
import { cn } from "@matops/ui";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import { CopyButton } from "@matops/ui/copy-button";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";
import { cardClass, Eyebrow } from "./primitives";
import { SkeletonDuesBody } from "./skeletons";
import { ErrorState } from "./states";

export function MembershipNotice() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const standing = useQuery(trpc.accessPlan.mine.queryOptions());
  const claim = useMutation(
    trpc.accessPlan.claimMonth.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.accessPlan.pathFilter());
        toast.success("Payment submitted. Your gym will confirm it.");
      },
      onError: (e) => toast.error(e.message || "Could not submit your payment"),
    }),
  );
  const warned = (standing.data?.memberships ?? []).filter((m) => m.warning);
  const bankDetails = standing.data?.bankDetails ?? "";
  const showPaymentInstructions =
    Boolean(bankDetails) && warned.some((m) => !m.claimedAt);

  if (standing.isPending) return <SkeletonDuesBody />;
  if (standing.isError) {
    return (
      <ErrorState
        label="your membership"
        onRetry={() => void standing.refetch()}
      />
    );
  }
  if (warned.length === 0) return null;

  return (
    <div
      className={cn(
        "grid items-start gap-6",
        showPaymentInstructions &&
          "lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.7fr)]",
      )}
    >
      <section aria-label="Membership payments" className="min-w-0 space-y-4">
        {warned.map((m) => (
          <div
            key={m.assignmentId}
            className={`${cardClass()} ${
              m.warning?.verdict === "blocked"
                ? "border-destructive/40"
                : "border-brand/25"
            } flex flex-col gap-4`}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2 className="text-base font-semibold">{m.planName}</h2>
              {m.amount && (
                <p className="font-mono text-xl tabular-nums">
                  {formatMoney(m.amount.priceMinor, m.amount.currency)}
                </p>
              )}
            </div>
            <div>
              <p className="text-sm font-medium">{m.warning?.headline}</p>
              <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                {m.warning?.detail}
              </p>
            </div>
            {m.claimedAt ? (
              <div className="bg-brand-wash rounded-md p-3" role="status">
                <p className="text-sm font-medium">Waiting for confirmation</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  You submitted this payment. Your gym still needs to confirm
                  it. You do not need to submit it again.
                </p>
              </div>
            ) : bankDetails ? (
              <div className="border-border space-y-4 border-t pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-muted-foreground text-sm">
                      Transfer reference
                    </p>
                    <p className="mt-1 font-mono text-base break-all">
                      {m.reference}
                    </p>
                  </div>
                  <CopyButton value={m.reference} label="Copy reference" />
                </div>
                <ConfirmDialog
                  title="Have you sent the bank transfer?"
                  description="This tells your gym you sent the transfer. They will confirm it once the money arrives."
                  confirmLabel="Yes, I paid"
                  variant="primary"
                  onConfirm={async () => {
                    await claim.mutateAsync({ assignmentId: m.assignmentId });
                  }}
                  trigger={
                    <Button
                      busy={
                        claim.isPending &&
                        claim.variables.assignmentId === m.assignmentId
                      }
                      disabled={claim.isPending}
                    >
                      I paid
                    </Button>
                  }
                />
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Ask your gym for payment instructions.
              </p>
            )}
          </div>
        ))}
      </section>
      {showPaymentInstructions && (
        <aside className="border-border min-w-0 space-y-4 border-t pt-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
          <div>
            <h2 className="text-base font-semibold">How to pay</h2>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              Send a transfer in your bank app. Use the amount and reference
              shown for each membership, then select “I paid”.
            </p>
          </div>
          <div className={cardClass()}>
            <Eyebrow>Bank details</Eyebrow>
            <p className="mt-2 text-sm leading-relaxed break-words whitespace-pre-wrap">
              {bankDetails}
            </p>
            <CopyButton
              value={bankDetails}
              label="Copy bank details"
              className="mt-4"
            />
          </div>
        </aside>
      )}
    </div>
  );
}

/**
 * The plan waiting for the 1st (ADR 129).
 *
 * A member should read what they will be on and what it costs before the month
 * turns, rather than find out from an amount that changed. Nothing here is a
 * warning: this month is unaffected and there is nothing to pay early.
 */
export function MembershipChangeNotice() {
  const trpc = useTRPC();
  const standing = useQuery(trpc.accessPlan.mine.queryOptions());
  const changing = (standing.data?.memberships ?? []).filter((m) => m.next);
  if (changing.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {changing.map((m) => (
        <div key={m.assignmentId} className={cardClass()}>
          <Eyebrow>Your plan changes</Eyebrow>
          <p className="mt-1 text-sm">
            {m.planName} runs to the end of this month. {m.next?.planName}{" "}
            starts on 1 {m.next?.effectiveMonthLabel}
            {m.next?.amount
              ? ` at ${formatMoney(m.next.amount.priceMinor, m.next.amount.currency)} a month`
              : ""}
            .
          </p>
        </div>
      ))}
    </div>
  );
}
