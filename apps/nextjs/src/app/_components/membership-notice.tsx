"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { formatMoney } from "@matops/domain";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import { CopyButton } from "@matops/ui/copy-button";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";
import { cardClass, Eyebrow } from "./primitives";

/**
 * What a member owes on their shared memberships, by when, and where to send it
 * (ADR 126, ADR 127).
 *
 * Says nothing at all when every month is settled: a notice that is only ever
 * there when something is wrong is one people read. The wording comes from
 * `membershipWarning` in the domain, so the web and the app say the same
 * sentence about the same situation.
 *
 * One notice per membership, never one per covered branch. Somebody whose plan
 * covers a mat and a gym owes one payment and is told once, with one reference:
 * two memberships are two payments and get two.
 */
export function MembershipNotice() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const standing = useQuery(trpc.accessPlan.mine.queryOptions());
  const claim = useMutation(
    trpc.accessPlan.claimMonth.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.accessPlan.pathFilter());
        toast.success("Your gym has been told");
      },
      onError: (e) => toast.error(e.message || "Could not send that"),
    }),
  );
  const warned = (standing.data?.memberships ?? []).filter((m) => m.warning);
  const bankDetails = standing.data?.bankDetails ?? "";

  if (warned.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {warned.map((m) => (
        <div key={m.assignmentId} className="flex flex-col gap-2">
          <div
            className={`${cardClass()} ${
              m.warning?.verdict === "blocked"
                ? "border-destructive/40 bg-destructive/5"
                : "border-brand/25 bg-brand-wash"
            } flex flex-col gap-1`}
          >
            <p className="text-sm font-medium">{m.warning?.headline}</p>
            <p className="text-muted-foreground text-sm">{m.warning?.detail}</p>
            {m.amount && (
              // The amount this MONTH cost, not the plan's price today: a
              // member reading an old month must see what they were asked for
              // (ADR 128).
              <p className="text-sm font-medium">
                {formatMoney(m.amount.priceMinor, m.amount.currency)}
              </p>
            )}
          </div>

          {bankDetails ? (
            <div className="flex flex-col gap-2">
              <div className={cardClass()}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Eyebrow>Bank details</Eyebrow>
                    <p className="mt-1 text-sm whitespace-pre-wrap">
                      {bankDetails}
                    </p>
                  </div>
                  <CopyButton
                    value={bankDetails}
                    label="Copy bank details"
                    iconOnly
                  />
                </div>
              </div>
              {m.amount && (
                <div className={cardClass()}>
                  <Eyebrow>Amount</Eyebrow>
                  <p className="mt-1 text-base font-medium">
                    {formatMoney(m.amount.priceMinor, m.amount.currency)}
                  </p>
                </div>
              )}
              <div className={cardClass()}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Eyebrow>Reference — add this to your transfer</Eyebrow>
                    <p className="mt-1 font-mono text-base">{m.reference}</p>
                  </div>
                  <CopyButton
                    value={m.reference}
                    label="Copy reference"
                    iconOnly
                  />
                </div>
              </div>
              <p className="text-muted-foreground text-sm">
                Pay in your own bank app, then tell your gym here.
              </p>
              {m.claimedAt ? (
                <p className="text-muted-foreground text-sm">
                  Payment submitted — waiting for your gym to confirm.
                </p>
              ) : (
                <ConfirmDialog
                  title="Mark this as paid?"
                  description="This tells your gym you sent the transfer. They'll confirm it once the money arrives."
                  confirmLabel="I paid"
                  variant="primary"
                  onConfirm={async () => {
                    await claim.mutateAsync({ assignmentId: m.assignmentId });
                  }}
                  trigger={
                    <Button busy={claim.isPending} className="self-start">
                      I paid
                    </Button>
                  }
                />
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              Ask your gym for their bank details to pay.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
