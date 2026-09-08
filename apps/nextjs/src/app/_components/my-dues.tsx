"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";
import { useEntity } from "./entity";
import { MembershipChangeNotice, MembershipNotice } from "./membership-notice";
import { PageHeader } from "./page-header";
import { Section } from "./primitives";
import { EmptyState, SuspendedState } from "./states";

export function MyDues() {
  const { status } = useEntity();
  return (
    <>
      <PageHeader
        title="Membership"
        subtitle="Check your membership, payment status, and transfer details."
      />
      <MembershipNotice />
      <div className="mt-8 space-y-8">
        {status === "suspended" ? (
          <SuspendedState />
        ) : status === "pending" ? (
          <EmptyState title="Memberships appear after your gym approves you.">
            You can browse the schedule while you wait.
          </EmptyState>
        ) : null}
        <MembershipSettled />
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
      <EmptyState title="Your gym has not assigned a membership yet.">
        Ask an owner or manager to assign your plan.
      </EmptyState>
    );
  }
  const settled = standing.data.memberships.filter(
    (membership) => !membership.warning,
  );
  if (settled.length === 0) return null;

  return (
    <Section label="Your memberships">
      <div className="divide-border divide-y">
        {settled.map((membership) => (
          <div
            key={membership.assignmentId}
            className="flex flex-wrap items-center justify-between gap-3 py-4"
          >
            <div>
              <h3 className="font-semibold">{membership.planName}</h3>
              <p className="text-muted-foreground mt-1 text-sm">
                {membership.status === "active"
                  ? "No payment is due for this month."
                  : "This membership is inactive. Contact your gym for help."}
              </p>
            </div>
            <span className="text-muted-foreground text-sm">
              {membership.status === "active"
                ? membership.paymentRequired
                  ? "Up to date"
                  : "Free"
                : "Inactive"}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}
