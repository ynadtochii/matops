"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@matops/ui/button";

import { useAnyBranchTakesPayment, useOrganization } from "./entity";
import { MonthsTab } from "./memberships/months";
import { NewPlanDialog, PlansTab } from "./memberships/plans";
import { SetupTab } from "./memberships/setup";
import { ToCheckTab, useToCheckCount } from "./memberships/to-check";
import { PageHeader } from "./page-header";
import { EmptyState } from "./states";
import { Tabs } from "./tabs";

/**
 * The organization's membership plans (ADR 126).
 *
 * It sits outside a branch on purpose: a plan belongs to the owner group and
 * can cover more than one branch, so there is no single branch it could live
 * under. Assigning one to a person happens on
 * that person's member profile inside a branch, which is where an owner already
 * is when they think about it.
 */
type MembershipTab = "check" | "months" | "plans" | "setup";

const TAB_PARAMS: Record<string, MembershipTab> = {
  check: "check",
  payments: "check",
  access: "check",
  months: "months",
  plans: "plans",
  setup: "setup",
};

export function MembershipsScreen() {
  const { canRunOrganization } = useOrganization();

  if (!canRunOrganization) {
    return (
      <div>
        <EmptyState title="Only the people who run this gym can shape its membership plans.">
          Ask whoever runs the gym.
        </EmptyState>
      </div>
    );
  }
  return <Memberships />;
}

function Memberships() {
  const inUse = useAnyBranchTakesPayment();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<MembershipTab>(
    TAB_PARAMS[searchParams.get("tab") ?? ""] ?? "check",
  );
  const toCheck = useToCheckCount();
  const [adding, setAdding] = useState(false);

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

      {!inUse && tab !== "setup" && (
        <p className="text-muted-foreground text-sm">
          Membership payments are off. Students do not see plans or months, and
          they book without paying.{" "}
          <button
            type="button"
            className="text-foreground underline underline-offset-4"
            onClick={() => setTab("setup")}
          >
            Turn them on in Setup
          </button>{" "}
          when you are ready.
        </p>
      )}

      <Tabs
        label="Membership views"
        value={tab}
        onChange={setTab}
        tabs={[
          {
            id: "check",
            label: "To check",
            count: toCheck.money + toCheck.access,
          },
          { id: "months", label: "Months" },
          { id: "plans", label: "Plans" },
          { id: "setup", label: "Setup" },
        ]}
      />

      {tab === "check" && <ToCheckTab />}
      {tab === "months" && <MonthsTab />}
      {tab === "plans" && (
        <PlansTab
          onNewPlan={() => setAdding(true)}
          onOpenSetup={() => setTab("setup")}
        />
      )}
      {tab === "setup" && <SetupTab />}

      <NewPlanDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}
