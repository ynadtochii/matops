"use client";

import type { ReactNode } from "react";
import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";

import { useTRPC } from "~/trpc/react";
import { PageHeader } from "./page-header";
import { EmptyState, ErrorState, SkeletonRows } from "./states";

type ClassRow = RouterOutputs["class"]["week"][number];

const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});
const dateFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "long",
  day: "numeric",
});
const sameDay = (value: Date | string, d: Date) => {
  const x = new Date(value);
  return (
    x.getFullYear() === d.getFullYear() &&
    x.getMonth() === d.getMonth() &&
    x.getDate() === d.getDate()
  );
};

/**
 * O1 Dashboard — the "run the week" command center (ticket 03). Triage cards for
 * what needs the owner now (pending approvals, drop-in leads), a few glanceable
 * numbers, today's classes, and quick actions. Instructors get the schedule half
 * without the owner-only triage.
 */
export function DashboardScreen() {
  const trpc = useTRPC();
  const current = useQuery(trpc.academy.current.queryOptions());

  const c = current.data;
  const isActive = c?.status === "active";
  const isOwner = c?.role === "owner" && isActive;
  const isStaff = isActive && (c.role === "owner" || c.role === "instructor");

  const { startOfToday, weekTo, today } = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    const end = new Date(t);
    end.setDate(end.getDate() + 7);
    return { startOfToday: t.toISOString(), weekTo: end.toISOString(), today: t };
  }, []);

  const week = useQuery({
    ...trpc.class.week.queryOptions({ from: startOfToday, to: weekTo }),
    enabled: isStaff,
  });
  const roster = useQuery({
    ...trpc.membership.roster.queryOptions(),
    enabled: isOwner,
  });
  const leads = useQuery({
    ...trpc.dropIn.list.queryOptions(),
    enabled: isOwner,
  });
  const insights = useQuery({
    ...trpc.stats.gym.queryOptions(),
    enabled: isStaff,
  });
  const drifting = useQuery({
    ...trpc.stats.drifting.queryOptions(),
    enabled: isOwner,
  });

  if (current.isPending) return <SkeletonRows rows={5} />;
  if (current.isError || !c)
    return (
      <ErrorState label="your dashboard" onRetry={() => void current.refetch()} />
    );

  // A not-yet-approved coach: the shell already shows the pending banner.
  if (!isStaff) {
    return (
      <>
        <PageHeader title={`Welcome, ${c.name}`} />
        <EmptyState title="You're almost in.">
          Your academy owner will approve you shortly. Once they do, your
          schedule, roster, and attendance tools appear here.
        </EmptyState>
      </>
    );
  }

  const todays = (week.data ?? [])
    .filter((r) => sameDay(r.startsAt, today) && r.status !== "cancelled")
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
  const members = roster.data ?? [];
  const pendingCount = members.filter((m) => m.status === "pending").length;
  const activeCount = members.filter((m) => m.status === "active").length;
  const leadCount = leads.data?.length ?? 0;
  const weekCount = (week.data ?? []).filter(
    (r) => r.status !== "cancelled",
  ).length;

  return (
    <>
      <PageHeader title="This week" subtitle={dateFmt.format(today)} />

      {/* Triage — what needs you now (owner only) */}
      {isOwner && (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TriageCard
            href="/roster"
            value={pendingCount}
            label="Pending approvals"
            active={pendingCount > 0}
          />
          <TriageCard
            href="/roster"
            value={leadCount}
            label="Drop-in leads"
            active={leadCount > 0}
          />
          <TriageCard href="/attendance" value={todays.length} label="Classes today" />
        </div>
      )}

      {/* Glanceable numbers */}
      <div className="border-border mb-8 flex flex-wrap gap-x-8 gap-y-3 border-b pb-6">
        {isOwner && <Stat value={activeCount} label="Active members" />}
        <Stat value={weekCount} label="Classes this week" />
        <Stat value={todays.length} label="On today" />
      </div>

      {/* Today's classes */}
      <div className="mb-8 flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Today</h2>
        {week.isPending ? (
          <SkeletonRows rows={2} />
        ) : week.isError ? (
          <ErrorState label="today's classes" onRetry={() => void week.refetch()} />
        ) : todays.length === 0 ? (
          <EmptyState
            title="No classes today."
            action={
              <Link
                href="/schedule"
                className="text-brand-strong text-sm font-medium"
              >
                Add a class →
              </Link>
            }
          >
            Enjoy the rest day, or add a one-off from the schedule.
          </EmptyState>
        ) : (
          todays.map((cl) => <TodayRow key={cl.id} c={cl} />)
        )}
      </div>

      {/* Insights — gym activity over the last 30 days */}
      <div className="mb-8 flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Insights</h2>
        {insights.isPending ? (
          <SkeletonRows rows={2} />
        ) : insights.isError ? (
          <ErrorState
            label="gym insights"
            onRetry={() => void insights.refetch()}
          />
        ) : (
          <Insights data={insights.data} isOwner={isOwner} />
        )}
      </div>

      {/* Who's drifting — members who used to train and have gone quiet */}
      {isOwner && (
        <div className="mb-8 flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Who&apos;s drifting</h2>
          {drifting.isPending ? (
            <SkeletonRows rows={2} />
          ) : drifting.isError ? (
            <ErrorState
              label="the drifting list"
              onRetry={() => void drifting.refetch()}
            />
          ) : drifting.data.length === 0 ? (
            <EmptyState title="Everyone's showing up.">
              Members who used to train here but have gone quiet appear here so
              you can reach out.
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-2">
              {drifting.data.slice(0, 6).map((m) => (
                <DriftRow key={m.memberId} m={m} today={today} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <QuickAction href="/schedule">Add class</QuickAction>
        <QuickAction href="/attendance">Take attendance</QuickAction>
        {isOwner && <QuickAction href="/roster">Approve members</QuickAction>}
      </div>
    </>
  );
}

function TriageCard({
  href,
  value,
  label,
  active,
}: {
  href: string;
  value: number;
  label: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg border p-4 transition-colors ${
        active
          ? "border-brand/40 bg-brand-wash hover:border-brand"
          : "border-border hover:bg-muted"
      }`}
    >
      <p
        className={`font-mono text-3xl tabular-nums ${active ? "text-brand-strong" : ""}`}
      >
        {value}
      </p>
      <p className="text-muted-foreground mt-0.5 text-sm">{label}</p>
    </Link>
  );
}

function Stat({
  value,
  label,
}: {
  value: number | string;
  label: string;
}) {
  return (
    <div>
      <p className="font-mono text-xl tabular-nums">{value}</p>
      <p className="text-muted-foreground font-mono text-[10px] tracking-wide uppercase">
        {label}
      </p>
    </div>
  );
}

function TodayRow({ c }: { c: ClassRow }) {
  const full = c.bookingCount >= c.capacity && c.capacity > 0;
  return (
    <div className="border-border flex items-center gap-3 border-b py-2.5 text-sm last:border-0">
      <span className="text-muted-foreground w-14 shrink-0 font-mono tabular-nums">
        {timeFmt.format(new Date(c.startsAt))}
      </span>
      <span className="flex-1 font-medium">{c.title}</span>
      <span
        className={`font-mono text-xs tabular-nums ${full ? "text-error" : "text-muted-foreground"}`}
      >
        {c.bookingCount}/{c.capacity}
        {c.pendingCount > 0 ? ` · +${c.pendingCount}` : ""}
      </span>
    </div>
  );
}

type GymInsights = RouterOutputs["stats"]["gym"];
type DriftMember = RouterOutputs["stats"]["drifting"][number];

const DRIFT_LABEL: Record<DriftMember["drift"], string> = {
  active: "Active",
  cooling: "Cooling",
  at_risk: "At risk",
  dormant: "Dormant",
};

/** Gym-activity block: counts lead, rate only shown when it's meaningful. */
function Insights({
  data,
  isOwner,
}: {
  data: GymInsights;
  isOwner: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <Stat value={data.visitsThisWeek} label="Visits this week" />
        <Stat value={data.visitsThisMonth} label="Visits this month" />
        {isOwner && (
          <Stat value={data.newMembersThisMonth} label="New members" />
        )}
        {data.attendanceRate !== null && (
          <Stat
            value={`${Math.round(data.attendanceRate * 100)}%`}
            label="Attendance rate"
          />
        )}
      </div>
      {data.busiest.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground font-mono text-[10px] tracking-wide uppercase">
            Busiest classes
          </p>
          {data.busiest.slice(0, 3).map((b) => (
            <div
              key={b.title}
              className="border-border flex items-center justify-between border-b py-1.5 text-sm last:border-0"
            >
              <span className="font-medium">{b.title}</span>
              <span className="text-muted-foreground font-mono text-xs tabular-nums">
                {b.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** One "who's drifting" row — links to the member's detail (C.2). */
function DriftRow({ m, today }: { m: DriftMember; today: Date }) {
  const days = m.lastAttendance
    ? Math.floor(
        (today.getTime() - new Date(m.lastAttendance).getTime()) /
          (24 * 60 * 60 * 1000),
      )
    : null;
  const tone =
    m.drift === "dormant"
      ? "text-error border-error/40"
      : m.drift === "at_risk"
        ? "text-warning border-warning/40"
        : "text-muted-foreground border-border";
  return (
    <Link
      href={`/roster?member=${m.memberId}`}
      className="border-border hover:bg-muted flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors"
    >
      <div className="flex flex-col">
        <span className="font-medium">{m.name}</span>
        <span className="text-muted-foreground text-sm">
          {days != null ? `Last trained ${days} days ago` : "No recent sessions"}
        </span>
      </div>
      <span
        className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}
      >
        {DRIFT_LABEL[m.drift]}
      </span>
    </Link>
  );
}

function QuickAction({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="border-border hover:bg-muted rounded-md border px-3 py-2 text-sm font-medium transition-colors"
    >
      {children}
    </Link>
  );
}
