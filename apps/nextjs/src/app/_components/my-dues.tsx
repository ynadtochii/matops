"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { formatMoney, PAYMENT_STATUS_LABEL } from "@matops/domain";
import { cn } from "@matops/ui";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import { CopyButton } from "@matops/ui/copy-button";
import { toast } from "@matops/ui/toast";

import { dateFmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { useEntity } from "./entity";
import { PageHeader } from "./page-header";
import { cardClass, DUES_TONE, ENTER, Eyebrow, Section } from "./primitives";
import { SkeletonDuesBody } from "./skeletons";
import { EmptyState, ErrorState, SuspendedState } from "./states";

export function MyDues() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { status } = useEntity();

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
        <SkeletonDuesBody />
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

  const { dues: d, requisites, openClaim, canPay, canChoosePlan } = dues.data;

  if (!d && canChoosePlan) {
    return (
      <>
        {header}
        <ChoosePlan />
      </>
    );
  }

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
          <Section label="What you owe" className={ENTER}>
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

        <Section label="How to pay" className={cn(ENTER, d && "delay-100")}>
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
                Pay in your own bank app, then tell your gym here.
              </p>
            </div>
          ) : (
            <EmptyState title="Ask your gym for their bank details to pay." />
          )}

          {d && (
            <div className="mt-2">
              {openClaim ? (
                <p className="text-muted-foreground text-sm">
                  Payment submitted — waiting for your gym to confirm. You can
                  book while it&apos;s pending.
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
                      busy={claim.isPending}
                      disabled={
                        !canPay || !requisites.bankDetails || claim.isPending
                      }
                    >
                      I paid
                    </Button>
                  }
                />
              )}
            </div>
          )}
        </Section>
      </div>
    </>
  );
}

function ChoosePlan() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const plans = useQuery(trpc.payments.planOptions.queryOptions());

  const choose = useMutation(
    trpc.payments.choosePlan.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.payments.pathFilter());
        toast.success("Membership chosen");
      },
      onError: (err) => toast.error(err.message || "Could not choose that"),
    }),
  );

  if (plans.isPending) return <SkeletonDuesBody />;
  if (plans.isError) {
    return (
      <ErrorState
        label="the membership plans"
        onRetry={() => void plans.refetch()}
      />
    );
  }
  if (plans.data.length === 0) {
    return (
      <EmptyState title="Your gym hasn't set up membership dues yet.">
        Nothing to pay here for now.
      </EmptyState>
    );
  }

  return (
    <Section label="Choose your membership" className={ENTER}>
      <p className="text-muted-foreground text-sm">
        Pick the plan you agreed with your gym. Your first payment is due on the
        1st of next month. Your gym can change your plan later.
      </p>
      <div className="flex flex-col gap-3">
        {plans.data.map((p) => (
          <div
            key={p.id}
            className={cn(
              cardClass(),
              "flex flex-wrap items-center justify-between gap-3",
            )}
          >
            <div className="min-w-0">
              <p className="font-medium">{p.name}</p>
              <p className="text-muted-foreground text-sm">
                {formatMoney(p.priceMinor, p.currency)} per month
              </p>
            </div>
            <ConfirmDialog
              title={`Choose ${p.name}?`}
              description="Your first payment is due on the 1st of next month. Ask your gym if you need a different plan later."
              confirmLabel="Choose this plan"
              variant="primary"
              onConfirm={async () => {
                await choose.mutateAsync({ planId: p.id });
              }}
              trigger={
                <Button
                  size="sm"
                  busy={choose.isPending && choose.variables.planId === p.id}
                  disabled={choose.isPending}
                >
                  Choose
                </Button>
              }
            />
          </div>
        ))}
      </div>
    </Section>
  );
}
