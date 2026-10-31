"use client";

import { useQuery } from "@tanstack/react-query";

import { Badge } from "@matops/ui/badge";

import { useTRPC } from "~/trpc/react";
import { ChooseMembership } from "./choose-membership";
import { useEntity } from "./entity";
import { MembershipChangeNotice } from "./membership-notice";
import { PageHeader } from "./page-header";
import { LIST, Section } from "./primitives";
import { SkeletonCard } from "./skeletons";
import { EmptyState, ErrorState, SuspendedState } from "./states";

const CHOOSING = new Set([
  "choose_plan",
  "no_plans",
  "finish_payment",
  "renew_due",
  "renew_overdue",
]);

export function MyDues() {
  const { status } = useEntity();
  const trpc = useTRPC();
  const standing = useQuery(trpc.accessPlan.mine.queryOptions());
  const choosing =
    standing.data?.banner && CHOOSING.has(standing.data.banner.kind)
      ? standing.data
      : null;
  return (
    <>
      <PageHeader
        title="Membership"
        subtitle="Choose your plan, pay for it, and check its status."
      />
      {choosing && <ChooseMembership mine={choosing} />}
      <div className="mt-8 space-y-8">
        {status === "suspended" ? (
          <SuspendedState />
        ) : status === "pending" ? (
          <EmptyState title="Memberships appear after your gym approves you.">
            You can browse the schedule while you wait.
          </EmptyState>
        ) : status === "active" && standing.isPending ? (
          <SkeletonCard lines={3} />
        ) : status === "active" && standing.isError ? (
          <ErrorState
            label="your membership"
            onRetry={() => void standing.refetch()}
          />
        ) : null}
        {!choosing && <MembershipSettled />}
        <MembershipChangeNotice />
      </div>
    </>
  );
}

function MembershipSettled() {
  const trpc = useTRPC();
  const standing = useQuery(trpc.accessPlan.mine.queryOptions());
  if (standing.isPending || standing.isError) return null;
  if (standing.data.memberships.length === 0) {
    return (
      <EmptyState title="You have no membership yet.">
        Your gym has not turned on membership payments here.
      </EmptyState>
    );
  }
  const settled = standing.data.memberships.filter(
    (membership) => !membership.warning,
  );
  const waiting = (m: (typeof settled)[number]) =>
    m.status === "active" && m.paymentStatus === "reported";
  if (settled.length === 0) return null;

  return (
    <Section label="Your memberships">
      <div className={LIST}>
        {settled.map((membership) => (
          <div
            key={membership.assignmentId}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div className="min-w-0">
              <h3 className="text-md font-semibold">{membership.planName}</h3>
              <p className="text-muted-foreground mt-1 text-sm">
                {waiting(membership)
                  ? membership.awaitingStaff
                    ? "Waiting for your gym to confirm your cash payment."
                    : "Your gym is checking your payment."
                  : membership.status === "active"
                    ? "No payment is due for this month."
                    : "This membership is inactive. Contact your gym for help."}
              </p>
            </div>
            <Badge
              tone={
                waiting(membership)
                  ? "warning"
                  : membership.status === "active" && membership.paymentRequired
                    ? "success"
                    : "neutral"
              }
            >
              {waiting(membership)
                ? "Waiting for the gym"
                : membership.status === "active"
                  ? membership.paymentRequired
                    ? "Up to date"
                    : "Free"
                  : "Inactive"}
            </Badge>
          </div>
        ))}
      </div>
    </Section>
  );
}
