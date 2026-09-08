"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import type { BranchRow } from "@matops/domain";
import {
  branchRows,
  entityHref,
  isPendingCoach,
  organizationHref,
} from "@matops/domain";
import { cn } from "@matops/ui";
import { Button } from "@matops/ui/button";

import { useTRPC } from "~/trpc/react";
import { useOrganization } from "./entity";
import { AddBranchButton } from "./entity-selector";
import { JoinByCode } from "./join-by-code";
import { cardClass, ENTER, Eyebrow, stagger } from "./primitives";
import { SetupChecklist } from "./setup-checklist";

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
          any time, and they will share this organization&apos;s people and
          memberships.
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

  if (entities.length === 0) {
    // An owner here has just made the gym and has no branch yet, which is where
    // setup begins rather than a sign that something failed (ADR 128). Anyone
    // else with no branch is looking for one to join.
    if (canCreateBranches)
      return <FirstBranch organizationName={organizationName} />;
    return (
      <div className="flex min-h-[50vh] items-center justify-center py-6">
        <JoinByCode />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-8">
      <div className="border-border flex flex-wrap items-center justify-between gap-4 border-b pb-6">
        <div>
          <Eyebrow>Organization overview</Eyebrow>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight wrap-anywhere">
            {organizationName}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {canRunOrganization
              ? "Open a branch to manage its schedule and people."
              : "Pick a branch to open."}
          </p>
        </div>
        {canRunOrganization && (
          <div className="flex flex-wrap gap-2">
            {canCreateBranches && <AddBranchButton />}
          </div>
        )}
      </div>

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
 * What needs doing today, above the figures (ADR 129).
 *
 * Every line is a link to the exact person, queue or booking, because a count
 * an owner cannot click is a reminder rather than a piece of work. It reads the
 * queries the other screens already make, so nothing here is a second version
 * of the truth and a broken section leaves the rest usable.
 */
function NeedsAttention() {
  const trpc = useTRPC();
  const branchId = useSearchParams().get("branch") ?? undefined;
  const claims = useQuery(trpc.accessPlan.claims.queryOptions());
  const directory = useQuery(trpc.stats.organizationMembers.queryOptions());
  const uncovered = useQuery(trpc.accessPlan.uncovered.queryOptions());
  const review = useQuery(
    trpc.accessPlan.bookingsToReview.queryOptions({ limit: 50 }),
  );

  const rows = directory.data?.rows ?? [];
  const waitingStudents = rows.flatMap((r) =>
    r.branches
      .filter((b) => b.status === "pending" && !isPendingCoach(b))
      .map((b) => ({ row: r, branch: b })),
  );
  const waitingCoaches = rows.flatMap((r) =>
    r.branches.filter(isPendingCoach).map((b) => ({ row: r, branch: b })),
  );

  const items: {
    key: string;
    name: string;
    detail: string;
    reason: string;
    href: string;
  }[] = [
    ...(claims.data ?? []).map((c) => ({
      key: `claim-${c.assignmentId}`,
      name: c.name,
      detail: c.planName,
      reason: "Payment claims",
      href: `/people/${c.personId}`,
    })),
    ...waitingStudents.map(({ row, branch }) => ({
      key: `student-${branch.entityId}-${row.userId}`,
      name: row.name,
      detail: branch.entityName,
      reason: "Join requests",
      href: entityHref(
        branch.entityId,
        branch.memberId
          ? `/members?tab=requests&member=${encodeURIComponent(branch.memberId)}`
          : "/members?tab=requests",
      ),
    })),
    ...waitingCoaches.map(({ row, branch }) => ({
      key: `coach-${branch.entityId}-${row.userId}`,
      name: row.name,
      detail: branch.entityName,
      reason: "Coach access requests",
      href: entityHref(branch.entityId, "/coaches"),
    })),
    ...(uncovered.data?.groups ?? []).flatMap((g) =>
      g.people.map((p) => ({
        key: `uncovered-${g.entityId}-${p.personId}`,
        name: p.name,
        detail: g.entityName,
        reason: "Missing membership",
        href: `/people/${p.personId}`,
      })),
    ),
    ...(review.data?.items ?? []).map((b) => ({
      key: `booking-${b.participationId}`,
      name: b.name,
      detail: `${b.title} · ${b.entityName}`,
      reason: "Bookings without access",
      href: entityHref(b.entityId, `/class/${b.classId}`),
    })),
  ];

  const groups = [...new Set(items.map((item) => item.reason))].map(
    (reason) => ({
      reason,
      items: items.filter((item) => item.reason === reason),
    }),
  );
  const queries = [claims, directory, uncovered, review];
  const loading = queries.some((query) => query.isPending);
  const failed = queries.some((query) => query.isError);
  const retry = () => {
    for (const query of queries) {
      if (query.isError) void query.refetch();
    }
  };

  return (
    <OverviewSection
      label="Needs attention"
      accentCount
      meta={
        items.length
          ? `${items.length}${loading || failed || review.data?.more ? "+" : ""} tasks`
          : undefined
      }
    >
      {loading && (
        <p role="status" className="text-muted-foreground text-sm">
          Checking for tasks…
        </p>
      )}
      {failed && (
        <div
          role="status"
          className="border-warning/40 bg-warning/5 flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
        >
          <p>Some tasks could not load. This list may be incomplete.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={retry}
            disabled={queries.some((query) => query.isFetching)}
          >
            Retry tasks
          </Button>
        </div>
      )}
      {!loading && !failed && items.length === 0 && (
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="bg-success text-success-foreground flex size-5 shrink-0 items-center justify-center rounded-full text-xs"
          >
            ✓
          </span>
          <div>
            <p className="text-sm font-medium">All caught up</p>
            <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
              No pending approvals, payment claims or access issues.
            </p>
          </div>
        </div>
      )}
      <div id="gym-attention-list" className="flex flex-col gap-3">
        {groups.map((group) => {
          const collapsible = group.items.length > 1;
          const heading = (
            <h3 className="flex items-center justify-between gap-3 text-xs font-semibold">
              <span>{group.reason}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-muted-foreground font-mono tabular-nums">
                  {group.items.length}
                  {group.reason === "Bookings without access" &&
                  review.data?.more
                    ? "+"
                    : ""}
                </span>
                {collapsible && (
                  <svg
                    aria-hidden
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  >
                    <path
                      d="m4 6 4 4 4-4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
            </h3>
          );
          const people = (
            <ul className="divide-border flex flex-col divide-y">
              {group.items.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className="hover:bg-muted focus-visible:outline-ring flex items-center justify-between gap-3 rounded-md px-2 py-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-1 wrap-anywhere">
                      <span className="font-medium">{item.name}</span>
                      <span className="text-muted-foreground text-xs leading-relaxed">
                        {item.detail}
                      </span>
                      <span className="sr-only">{group.reason}</span>
                    </span>
                    <span
                      aria-hidden
                      className="text-muted-foreground shrink-0"
                    >
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          );
          return collapsible ? (
            <details
              key={group.reason}
              className="group border-border border-b pb-3 last:border-b-0 last:pb-0"
            >
              <summary className="hover:bg-muted focus-visible:outline-ring min-h-11 cursor-pointer list-none content-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
                {heading}
              </summary>
              {people}
            </details>
          ) : (
            <section
              key={group.reason}
              className="border-border flex flex-col gap-1 border-b pb-3 last:border-b-0 last:pb-0"
            >
              {heading}
              {people}
            </section>
          );
        })}
      </div>
      {review.data?.more && (
        <p className="text-muted-foreground text-sm">
          Showing the first 50 bookings with access issues.{" "}
          <Link
            href={organizationHref("/memberships?tab=access", branchId)}
            className="text-brand-strong underline underline-offset-4"
          >
            Review membership access
          </Link>
        </p>
      )}
    </OverviewSection>
  );
}

function OwnerOverview() {
  const { entities } = useOrganization();
  const trpc = useTRPC();
  const summary = useQuery(trpc.stats.organization.queryOptions());
  const metrics = useQuery(trpc.stats.organizationMetrics.queryOptions());

  const m = metrics.data;
  const rows = summary.data ? branchRows(summary.data.entities, m) : [];

  return (
    <div className={`flex min-w-0 flex-col gap-8 ${ENTER}`}>
      <div className="grid min-w-0 items-start gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="contents min-w-0 flex-col gap-8 xl:flex">
          <OverviewSection
            label="Branches"
            meta={`${summary.data?.entities.length ?? entities.length} total`}
          >
            {summary.isPending && (
              <p role="status" className="text-muted-foreground text-sm">
                Loading branch activity…
              </p>
            )}
            {summary.isError && (
              <div
                role="status"
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <p>
                  Branch activity could not load. You can still open a branch.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void summary.refetch()}
                  disabled={summary.isFetching}
                >
                  Retry activity
                </Button>
              </div>
            )}
            {summary.data ? (
              <ul className="flex flex-col gap-3">
                {rows.map((row, i) => (
                  <li key={row.entityId} style={stagger(i)} className={ENTER}>
                    <BranchCard row={row} known={m !== undefined} />
                  </li>
                ))}
              </ul>
            ) : (
              <FallbackList />
            )}
          </OverviewSection>
        </div>
        <aside
          aria-label="Tasks and setup"
          className="border-border order-2 flex min-w-0 flex-col gap-6 xl:order-none xl:border-l xl:pl-6"
        >
          <NeedsAttention />
          <SetupChecklist compact />
        </aside>
      </div>
    </div>
  );
}

function BranchCard({ row, known }: { row: BranchRow; known: boolean }) {
  const stats = [
    {
      label: "Enrolments",
      value: known ? row.enrolments.toLocaleString() : "Unavailable",
      period: "Current",
    },
    {
      label: "Classes",
      value: row.upcomingClasses.toLocaleString(),
      period: "Next 7 days",
    },
    {
      label: "Visits",
      value: known ? row.visits.toLocaleString() : "Unavailable",
      period: "Last 30 days",
    },
  ];
  return (
    <Link
      href={entityHref(row.entityId)}
      className={`${cardClass({ interactive: true })} group focus-visible:outline-brand flex flex-col gap-4 focus-visible:outline-2 focus-visible:outline-offset-2`}
    >
      <span className="flex items-center justify-between gap-3">
        <span className="min-w-0 text-lg font-semibold tracking-tight wrap-anywhere">
          {row.name}
        </span>
        <span className="text-brand-strong flex shrink-0 items-center gap-2 text-xs font-medium">
          Open branch{" "}
          <span
            aria-hidden
            className="transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
          >
            →
          </span>
        </span>
      </span>
      <dl className="grid grid-cols-3 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="flex min-w-0 flex-col gap-1">
            <dt className="text-muted-foreground text-xs">{stat.label}</dt>
            <dd
              className={
                stat.value === "Unavailable"
                  ? "text-muted-foreground text-xs"
                  : "font-mono text-xl tabular-nums"
              }
            >
              {stat.value === "Unavailable" ? (
                <span aria-label={`${stat.label} unavailable`}>Not loaded</span>
              ) : (
                stat.value
              )}
            </dd>
            <dd className="text-muted-foreground text-[11px]">{stat.period}</dd>
          </div>
        ))}
      </dl>
      {known && row.places > 0 && (
        <span className="text-muted-foreground border-border border-t pt-3 text-xs leading-relaxed tabular-nums">
          {row.reserved.toLocaleString()} / {row.places.toLocaleString()} places
          booked · Last 30 days
        </span>
      )}
      {row.waiting > 0 && (
        <span className="text-muted-foreground text-xs font-medium">
          {waitingLabel(row)}
        </span>
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
      className={`${cardClass({ interactive: true })} focus-visible:outline-ring flex items-center justify-between gap-3 focus-visible:outline-2 focus-visible:outline-offset-2`}
    >
      <span className="min-w-0 font-medium wrap-anywhere">{name}</span>
      <span className="text-muted-foreground shrink-0 text-xs">
        Open branch <span aria-hidden>→</span>
      </span>
    </Link>
  );
}

function waitingLabel(r: BranchRow): string {
  const parts: string[] = [];
  if (r.pendingMembers > 0) parts.push(`${r.pendingMembers} to approve`);
  if (r.newLeads > 0)
    parts.push(`${r.newLeads} new lead${r.newLeads === 1 ? "" : "s"}`);
  if (r.openClaims > 0) parts.push(`${r.openClaims} to confirm`);
  return parts.join(" · ");
}

function OverviewSection({
  label,
  meta,
  accentCount = false,
  children,
}: {
  label: string;
  meta?: string;
  accentCount?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{label}</h2>
        {meta && (
          <span
            className={cn(
              "shrink-0 font-mono text-xs tabular-nums",
              accentCount
                ? "bg-brand-wash text-brand-strong rounded-full px-2.5 py-1"
                : "text-muted-foreground",
            )}
          >
            {meta}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}
