"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import type { BranchRow } from "@matops/domain";
import { branchRows, entityHref, formatMoney } from "@matops/domain";
import { Button } from "@matops/ui/button";

import { useTRPC } from "~/trpc/react";
import { AnnounceForm } from "./announce-form";
import { useOrganization } from "./entity";
import { AddBranchButton } from "./entity-selector";
import { JoinByCode } from "./join-by-code";
import {
  cardClass,
  CountBadge,
  ENTER,
  Eyebrow,
  Section,
  Stat,
} from "./primitives";
import { BranchLaunchHealth, SetupChecklist } from "./setup-checklist";
import { SkeletonCard } from "./skeletons";

type Metrics = RouterOutputs["stats"]["organizationMetrics"];

function FirstBranch({ organizationName }: { organizationName: string }) {
  return (
    <div
      className={`${ENTER} mx-auto flex w-full max-w-md flex-col gap-6 py-12`}
    >
      <div className="flex flex-col gap-2">
        <Eyebrow>{organizationName}</Eyebrow>
        <h1 className="text-2xl font-semibold tracking-tight">
          Add your first branch
        </h1>
        <p className="text-muted-foreground text-sm">
          A branch is one place you run: a mat, a gym floor, a sauna. It keeps
          its own schedule, roster, join code and settings. You can add more at
          any time, and they will share this gym&apos;s people and memberships.
        </p>
      </div>
      <div className="flex">
        <AddBranchButton label="Create your first branch" primary />
      </div>
      <SetupChecklist />
    </div>
  );
}

// A student of one mat has no business knowing the organization runs two, so
// only an owner gets the totals.
export function OverviewScreen() {
  const { entities, canCreateBranches, canRunOrganization, organizationName } =
    useOrganization();
  const [posting, setPosting] = useState(false);

  if (entities.length === 0) {
    // An owner here has just made the gym and has no branch yet, which is where
    // setup begins rather than a sign that something failed (ADR 128). Anyone
    // else with no branch is looking for one to join.
    if (canCreateBranches)
      return <FirstBranch organizationName={organizationName} />;
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <JoinByCode />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your gym</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {canRunOrganization
              ? "Pick a branch to run, or add another."
              : "Pick a branch to open."}
          </p>
        </div>
        {canRunOrganization && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPosting((open) => !open)}
              aria-expanded={posting}
            >
              {posting ? "Close" : "Post an update"}
            </Button>
            {canCreateBranches && <AddBranchButton />}
          </div>
        )}
      </div>

      {canRunOrganization && posting && <AnnounceForm scope="organization" />}

      {canRunOrganization && <SetupChecklist compact />}
      {canRunOrganization && <BranchLaunchHealth />}

      {canRunOrganization ? (
        <OwnerOverview />
      ) : (
        <ul className="flex flex-col gap-2">
          {entities.map((e) => (
            <li key={e.id}>
              <PlainCard id={e.id} name={e.name} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The organization reads at the top, then one card per branch (ADR 126).
 *
 * People counts and branch counts are shown apart and never added: one person
 * training at two branches is ONE member and TWO enrolments, and a dashboard
 * that summed the branch numbers would quietly overstate the gym. So the
 * deduplicated people live in the strip and every per-branch figure lives on
 * the branch it belongs to, which is also the thing the owner clicks.
 *
 * No revenue in the strip on purpose. A paid/unpaid tracker records that
 * somebody ticked a box, which is not money arriving.
 */
function OwnerOverview() {
  const trpc = useTRPC();
  const summary = useQuery(trpc.stats.organization.queryOptions());
  const metrics = useQuery(trpc.stats.organizationMetrics.queryOptions());

  if (summary.isPending) {
    return (
      <div className="flex flex-col gap-6">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (summary.isError) return <FallbackList />;

  const { upcomingClasses, revenue, entities } = summary.data;
  const m = metrics.data;
  const rows = branchRows(entities, m);

  return (
    <div className={`flex flex-col gap-10 ${ENTER}`}>
      {metrics.isPending ? (
        <SkeletonCard />
      ) : (
        m && (
          <OrganizationReads m={m} classes={upcomingClasses} paid={revenue} />
        )
      )}

      <Section label="Branches" meta={`${rows.length} in this gym`}>
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.entityId}>
              <BranchCard row={r} known={m !== undefined} />
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function OrganizationReads({
  m,
  classes,
  paid,
}: {
  m: Metrics;
  classes: number;
  paid: { currency: string; amountMinor: number }[];
}) {
  return (
    <section className={`${cardClass()} flex flex-col gap-5`}>
      <div className="flex flex-col gap-1">
        <Eyebrow>The last 30 days</Eyebrow>
        <p className="text-muted-foreground text-sm">
          People are counted once, however many branches they train at.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        <Stat label="Members" value={String(m.enrolledMembers)} />
        <Stat label="With access" value={String(m.membersWithAccess)} />
        <Stat label="Trained" value={String(m.membersAttended)} />
        <Stat label="New" value={String(m.newMembers)} />
      </div>
      <p className="text-muted-foreground border-border border-t pt-4 font-mono text-[11px] tracking-wider uppercase tabular-nums">
        {classes} classes this week
        {paid.map((p) => (
          <span key={p.currency}>
            {" · "}
            {formatMoney(p.amountMinor, p.currency)} paid this month
          </span>
        ))}
      </p>
      {(m.payment.paid > 0 ||
        m.payment.withinGrace > 0 ||
        m.payment.blocked > 0) && (
        <p className="text-muted-foreground text-sm">
          Memberships this month: {m.payment.paid} paid, {m.payment.withinGrace}{" "}
          still within grace, {m.payment.blocked} blocked. Each membership
          counted once, whatever it covers.
        </p>
      )}
    </section>
  );
}

function BranchCard({ row, known }: { row: BranchRow; known: boolean }) {
  return (
    <Link
      href={entityHref(row.entityId)}
      className={`${cardClass({ interactive: true })} flex flex-col gap-1.5`}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="truncate font-medium">{row.name}</span>
        {row.waiting > 0 && <CountBadge>{row.waiting}</CountBadge>}
      </span>
      <span className="text-muted-foreground font-mono text-[11px] tracking-wide tabular-nums">
        {figures(row, known)}
      </span>
      {row.waiting > 0 && (
        <span className="text-brand-strong text-sm">{waitingLabel(row)}</span>
      )}
    </Link>
  );
}

function FallbackList() {
  const { entities } = useOrganization();
  return (
    <ul className="flex flex-col gap-2">
      {entities.map((e) => (
        <li key={e.id}>
          <PlainCard id={e.id} name={e.name} />
        </li>
      ))}
    </ul>
  );
}

function PlainCard({ id, name }: { id: string; name: string }) {
  return (
    <Link
      href={entityHref(id)}
      className={`${cardClass({ interactive: true })} flex items-center justify-between gap-3`}
    >
      <span className="truncate font-medium">{name}</span>
      <span className="text-muted-foreground shrink-0 text-xs">Open</span>
    </Link>
  );
}

// `known` is false while the metrics query is still out or has failed: a branch
// with 15 enrolments must not read "0 enrolments" because a second query broke.
function figures(r: BranchRow, known: boolean): string {
  const n = (v: number) => v.toLocaleString();
  if (known && r.enrolments === 0 && r.upcomingClasses === 0)
    return "Nothing here yet. Open it to add classes.";

  const parts = [`${n(r.upcomingClasses)} classes this week`];
  if (!known) return parts.join(" · ");

  parts.unshift(`${n(r.enrolments)} enrolments`);
  if (r.visits > 0) parts.push(`${n(r.visits)} visits`);
  if (r.places > 0)
    parts.push(`${n(r.reserved)} of ${n(r.places)} places taken`);
  return parts.join(" · ");
}

function waitingLabel(r: BranchRow): string {
  const parts: string[] = [];
  if (r.pendingMembers > 0) parts.push(`${r.pendingMembers} to approve`);
  if (r.newLeads > 0)
    parts.push(`${r.newLeads} new lead${r.newLeads === 1 ? "" : "s"}`);
  if (r.openClaims > 0) parts.push(`${r.openClaims} to confirm`);
  return parts.join(" · ");
}
