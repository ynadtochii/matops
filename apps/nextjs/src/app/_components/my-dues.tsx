"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { PAYMENT_STATUS_LABEL } from "@matops/domain";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import { CopyButton } from "@matops/ui/copy-button";
import { Spinner } from "@matops/ui/spinner";
import { toast } from "@matops/ui/toast";

import { dateFmt } from "~/lib/format";
import { formatMoney } from "~/lib/money";
import { useTRPC } from "~/trpc/react";
import { useAcademy } from "./academy";
import { PageHeader } from "./page-header";
import { cardClass, DUES_TONE, Eyebrow, Section } from "./primitives";
import { EmptyState, ErrorState, SkeletonRows, SuspendedState } from "./states";

export function MyDues() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { status } = useAcademy();

  const dues = useQuery({
    ...trpc.payments.myDues.queryOptions(),
    enabled: status === "active",
  });

  const claim = useMutation(
    trpc.payments.claim.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.payments.pathFilter());
        toast.success("Sent — your gym will confirm it");
      },
      onError: (err) => toast.error(err.message || "Could not send that"),
    }),
  );

  const header = (
    <PageHeader
      title="Membership dues"
      subtitle="What you owe, and how to pay it."
    />
  );

  if (status === "suspended") {
    return (
      <>
        {header}
        <SuspendedState />
      </>
    );
  }

  if (status === "pending") {
    return (
      <>
        {header}
        <EmptyState title="Dues appear once your gym approves you.">
          You can browse and book in the meantime.
        </EmptyState>
      </>
    );
  }

  if (dues.isPending) {
    return (
      <>
        {header}
        <SkeletonRows rows={3} />
      </>
    );
  }
  if (dues.isError) {
    return (
      <>
        {header}
        <ErrorState label="your dues" onRetry={() => void dues.refetch()} />
      </>
    );
  }

  const { dues: d, requisites, openClaim, canPay } = dues.data;

  if (!d && !requisites.bankDetails) {
    return (
      <>
        {header}
        <EmptyState title="Your gym hasn't set up membership dues yet.">
          Nothing to pay here for now.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      {header}
      <div className="flex flex-col gap-8">
        {d && (
          <Section label="What you owe">
            <div className={cardClass()}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-mono text-2xl tabular-nums">
                  {formatMoney(d.amountMinor, d.currency)}
                </span>
                <span className="inline-flex items-center gap-1.5 text-sm">
                  <span
                    aria-hidden
                    className={`inline-block size-2 rounded-full ${DUES_TONE[d.status]}`}
                  />
                  <span className="text-muted-foreground">
                    {PAYMENT_STATUS_LABEL[d.status]}
                  </span>
                </span>
              </div>
              <p className="text-muted-foreground mt-1 text-sm">
                {d.planName} · due{" "}
                <span className="font-mono tabular-nums">
                  {dateFmt.format(new Date(d.nextDueAt))}
                </span>
              </p>
            </div>
          </Section>
        )}

        <Section label="How to pay">
          {requisites.bankDetails ? (
            <div className="flex flex-col gap-3">
              <div className={cardClass()}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Eyebrow>Bank details</Eyebrow>
                    <p className="mt-1 text-sm whitespace-pre-wrap">
                      {requisites.bankDetails}
                    </p>
                  </div>
                  <CopyButton
                    value={requisites.bankDetails}
                    label="Copy bank details"
                    iconOnly
                  />
                </div>
              </div>
              <div className={cardClass()}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Eyebrow>Reference — add this to your transfer</Eyebrow>
                    <p className="mt-1 font-mono text-base">
                      {requisites.reference}
                    </p>
                  </div>
                  <CopyButton
                    value={requisites.reference}
                    label="Copy reference"
                    iconOnly
                  />
                </div>
              </div>
              <p className="text-muted-foreground text-sm">
                Pay in your own bank app, then tell your gym below.
              </p>
            </div>
          ) : (
            <EmptyState title="Ask your gym for their bank details to pay." />
          )}
        </Section>

        {d && (
          <div>
            {openClaim ? (
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
                  await claim.mutateAsync({});
                }}
                trigger={
                  <Button
                    disabled={
                      !canPay || !requisites.bankDetails || claim.isPending
                    }
                  >
                    {claim.isPending && (
                      <Spinner size="sm" className="text-current" />
                    )}
                    I paid
                  </Button>
                }
              />
            )}
          </div>
        )}
      </div>
    </>
  );
}
