"use client";

import type { ReactNode } from "react";
import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import type { DisciplineTone } from "@matops/domain";
import {
  capacityDisplay,
  classEndsAt,
  dashboardWeekWindow,
  dayPlan,
  daysSince,
  dayWindow,
  disciplineTone,
  formatMoney,
  groupMoneyByCurrency,
  isFirstRun,
  isOwner as isOwnerOf,
  isStaff as isStaffOf,
  needsAttendance,
  newLeadCount,
  rosterSummary,
  startOfDay,
  upcomingClassCount,
} from "@matops/domain";
import { cn } from "@matops/ui";
import { Button } from "@matops/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@matops/ui/dialog";

import { clockParts, dayLongFmt, timeFmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { useAcademy } from "./academy";
import { ClassRoster } from "./class-roster";
import { PageHeader } from "./page-header";
import {
  cardClass,
  disciplineDot,
  DriftBadge,
  Eyebrow,
  Section,
  Stat,
} from "./primitives";
import {
  Bar,
  SkeletonDayRail,
  SkeletonInsights,
  SkeletonQueue,
  SkeletonRows,
} from "./skeletons";
import { EmptyState, ErrorState } from "./states";
import { StudentScreen } from "./student-screen";

type ClassRow = Omit<RouterOutputs["class"]["week"][number], "startsAt"> & {
  startsAt: Date;
};

/** One row of the "needs you" queue. Rendered only while `count` is above zero. */
interface QueueItem {
  key: string;
  href: string;
  count: number;
  label: string;
  sub?: string | null;
}

/**
 * What the overdue members owe in total, but only when a single currency is in
 * play. Two currencies are never added together (the rule spec O9 already sets).
 */
function outstanding(
  rows: { dues: { priceMinor: number; currency: string } | null }[],
): string | null {
  const totals = groupMoneyByCurrency(
    rows.flatMap((r) =>
      r.dues
        ? [{ amountMinor: r.dues.priceMinor, currency: r.dues.currency }]
        : [],
    ),
  );
  const only = totals.length === 1 ? totals[0] : undefined;
  return only ? `${formatMoney(only.amountMinor, only.currency)} owed` : null;
}

/**
 * O1 Dashboard — the "run the week" command center (ticket 03). A "needs you"
 * action queue (every item is a blocker that can be driven to zero), a couple of
 * glanceable numbers, today's classes, insights, and who's drifting. Instructors
 * get the schedule half without the owner-only queue.
 */
export function DashboardScreen() {
  const trpc = useTRPC();
  const c = useAcademy();
  const [detailId, setDetailId] = useState<string | null>(null);

  const isOwner = isOwnerOf(c);
  const isStaff = isStaffOf(c);

  const { today, tomorrow, leadsSince } = useMemo(() => {
    const at = new Date();
    return {
      today: startOfDay(at),
      tomorrow: dayWindow(at, { aheadDays: 1 }).to,
      leadsSince: dayWindow(at, { backDays: 6, aheadDays: 0 }).from,
    };
  }, []);
  // The query window is a query key, so it stays frozen. The clock is not, and
  // freezing it left a long-open tab calling an ended class "now".
  const now = new Date();

  const week = useQuery({
    ...trpc.class.week.queryOptions(dashboardWeekWindow(now)),
    enabled: isStaff,
  });
  const memberList = useQuery({
    ...trpc.membership.members.queryOptions(),
    enabled: isStaff,
  });
  const leads = useQuery({
    ...trpc.dropIn.list.queryOptions(),
    enabled: isOwner,
  });
  const claims = useQuery({
    ...trpc.payments.claims.queryOptions(),
    enabled: isOwner,
  });
  const dash = useQuery({
    ...trpc.stats.dashboard.queryOptions(),
    enabled: isStaff,
  });

  if (!isStaff) return <StudentScreen />;

  const weekRows = (week.data ?? []).map((r) => ({
    ...r,
    startsAt: new Date(r.startsAt),
  }));
  const {
    list: dayList,
    showTomorrow,
    nowIndex,
  } = dayPlan(weekRows, today, tomorrow, now);
  const members = memberList.data ?? [];
  const {
    pendingStudents: pendingCount,
    pendingCoaches,
    active: activeCount,
    overdue,
  } = rosterSummary(members);
  const weekCount = upcomingClassCount(weekRows, today);
  const unmarked = weekRows.filter((r) => needsAttendance(r, now));
  const unmarkedIds = new Set(unmarked.map((r) => r.id));
  const newLeads = newLeadCount(
    (leads.data ?? []).map((l) => ({ lastVisitAt: new Date(l.lastVisitAt) })),
    leadsSince,
  );

  const queue: QueueItem[] = [
    {
      key: "attendance",
      href: "/attendance",
      count: unmarked.length,
      label: "Classes to mark",
    },
    {
      key: "approvals",
      href: "/members?tab=requests",
      count: pendingCount,
      label: "Pending approvals",
    },
    ...(!isOwner
      ? []
      : [
          {
            key: "claims",
            href: "/payments",
            count: claims.data?.length ?? 0,
            label: "Payments to confirm",
          },
          {
            key: "coach-requests",
            href: "/coaches",
            count: pendingCoaches,
            label: "Coach requests",
          },
          {
            key: "overdue",
            href: "/members?tab=members&filter=overdue",
            count: overdue.length,
            label: "Overdue members",
            sub: outstanding(overdue),
          },
          {
            key: "leads",
            href: "/members?tab=leads",
            count: newLeads,
            label: "New drop-in leads",
          },
        ]),
  ].filter((i) => i.count > 0);

  // Don't show "0" while the numbers are still loading — a skeleton reads as
  // "counting", a bare 0 reads as "nothing to do".
  const queueLoading =
    week.isPending ||
    memberList.isPending ||
    (isOwner && (leads.isPending || claims.isPending));
  const numbersLoading = week.isPending || memberList.isPending;
  const firstRun = isOwner && isFirstRun(activeCount, weekCount);

  const detail = (week.data ?? []).find((r) => r.id === detailId);

  return (
    <div className="space-y-10">
      <Dialog
        open={detail !== undefined}
        onOpenChange={(next) => !next && setDetailId(null)}
      >
        <DialogContent>
          {detail && (
            <>
              <DialogTitle>{detail.title}</DialogTitle>
              <DialogDescription>
                {timeFmt.format(new Date(detail.startsAt))} ·{" "}
                {detail.durationMinutes} min
                {detail.discipline && ` · ${detail.discipline.toUpperCase()}`}
                {detail.instructorName && ` · ${detail.instructorName}`}
              </DialogDescription>
              <ClassRoster key={detail.id} cls={detail} />
            </>
          )}
        </DialogContent>
      </Dialog>

      <div>
        <PageHeader title="This week" subtitle={dayLongFmt.format(today)} />

        {/* Needs you — one instrument panel of equal channels on a hairline
            grid; a job at zero is dropped, not drawn empty. The violet lives in
            the counts only: it is a spark, not a surface (design.md §1.1). */}
        {queueLoading ? (
          <SkeletonQueue />
        ) : firstRun ? (
          <EmptyState title="Your academy is empty. Three steps to open it.">
            <Link href="/schedule" className="text-brand-strong font-medium">
              1. Add your weekly classes
            </Link>
            {" · "}
            <Link href="/members" className="text-brand-strong font-medium">
              2. Share your join link
            </Link>
            {" · "}
            <Link
              href="/members?tab=leads"
              className="text-brand-strong font-medium"
            >
              3. Print the QR poster
            </Link>
          </EmptyState>
        ) : queue.length === 0 ? (
          <div className="border-border bg-grid-small rounded-lg border border-dashed p-6">
            <p className="text-sm font-medium">All clear.</p>
            <p className="text-muted-foreground mt-1 text-sm">
              {isOwner
                ? "Every class is marked, everyone is approved, every payment is settled."
                : "Every class is marked and everyone is approved."}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap">
            {queue.map((i) => (
              <QueueSegment
                key={i.key}
                href={i.href}
                count={i.count}
                label={i.label}
                sub={i.sub}
              />
            ))}
          </div>
        )}

        {/* Context, not readings — a caption under the panel, so the counts
            that need an action stay the only numbers competing for the eye. */}
        {numbersLoading ? (
          <Bar className="mt-3 h-3 w-56" />
        ) : (
          <p className="text-muted-foreground mt-3 font-mono text-[11px] tracking-wider uppercase tabular-nums">
            {isOwner && `${activeCount} active members · `}
            {weekCount} classes this week
          </p>
        )}
      </div>

      {/* The day's classes — today until its last class ends, then tomorrow */}
      <Section
        label={showTomorrow ? "Tomorrow" : "Today"}
        meta={
          week.isPending || week.isError
            ? undefined
            : `${dayList.length} ${dayList.length === 1 ? "class" : "classes"}`
        }
      >
        {week.isPending ? (
          <SkeletonDayRail rows={3} />
        ) : week.isError ? (
          <ErrorState
            label="today's classes"
            onRetry={() => void week.refetch()}
          />
        ) : dayList.length === 0 ? (
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
          <div className="relative">
            <span
              aria-hidden
              className="bg-border absolute top-4 bottom-4 left-[3.5px] w-px"
            />
            {dayList.map((cl, i) => (
              <Fragment key={cl.id}>
                {nowIndex === i && <NowLine now={now} />}
                <DayRow
                  c={cl}
                  mine={cl.instructorId === c.userId}
                  unmarked={unmarkedIds.has(cl.id)}
                  now={now}
                  onOpen={() => setDetailId(cl.id)}
                />
              </Fragment>
            ))}
            {nowIndex === dayList.length && <NowLine now={now} />}
          </div>
        )}
      </Section>

      {/* Insights — gym activity over the last 30 days */}
      <Section label="Insights">
        {dash.isPending ? (
          <SkeletonInsights />
        ) : dash.isError ? (
          <ErrorState label="gym insights" onRetry={() => void dash.refetch()} />
        ) : (
          <Insights
            data={dash.data.insights}
            revenue={dash.data.revenue ?? []}
          />
        )}
      </Section>

      {/* Who's drifting — members who used to train and have gone quiet */}
      {isOwner && (
        <Section
          label="Who's drifting"
          meta={
            dash.isPending || dash.isError || !dash.data.drifting?.length
              ? undefined
              : `${dash.data.drifting.length} members`
          }
        >
          {dash.isPending ? (
            <SkeletonRows rows={3} action variant="outline" />
          ) : dash.isError ? (
            <ErrorState
              label="the drifting list"
              onRetry={() => void dash.refetch()}
            />
          ) : !dash.data.drifting?.length ? (
            <EmptyState title="Everyone's showing up.">
              Members who used to train here but have gone quiet appear here so
              you can reach out.
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-2">
              {dash.data.drifting.slice(0, 6).map((m) => (
                <DriftRow key={m.memberId} m={m} today={today} />
              ))}
            </div>
          )}
        </Section>
      )}

      {/* Quick actions */}
      <Section label="Quick actions">
        <div className="flex flex-wrap gap-2">
          <QuickAction href="/schedule">Add class</QuickAction>
          <QuickAction href="/attendance">Take attendance</QuickAction>
        </div>
      </Section>
    </div>
  );
}

/**
 * One job on the queue: a mono count over a mono label. The channel is a fixed
 * 10.5rem so all six jobs fit the 1088px content column; a label longer than
 * that truncates rather than wrapping the tile taller than its neighbours. One
 * job and six jobs draw the identical tile; what changes is how many the strip
 * draws. Every cell owns all four hairlines and overlaps its neighbour by a
 * pixel, so shared edges collapse to one line and a half-filled row still
 * closes itself when the strip wraps.
 */
function QueueSegment({ href, count, label, sub }: Omit<QueueItem, "key">) {
  return (
    <Link
      href={href}
      className="group border-border hover:bg-muted focus-visible:ring-ring/50 -mr-px -mb-px w-1/2 shrink-0 border px-3 py-3 transition-colors focus-visible:ring-[3px] focus-visible:outline-none focus-visible:ring-inset sm:w-[10.5rem] sm:py-3.5"
    >
      <p className="text-brand-strong font-mono text-3xl leading-none tabular-nums sm:text-4xl">
        {count}
      </p>
      <p className="text-muted-foreground group-hover:text-foreground mt-2 truncate font-mono text-[10px] tracking-wider uppercase transition-colors sm:mt-2.5">
        {label}
      </p>
      {sub && (
        <p className="text-muted-foreground/70 mt-1 font-mono text-[10px] tabular-nums">
          {sub}
        </p>
      )}
    </Link>
  );
}

/** Where the gym is right now — the same marker the O2 week grid draws. */
function NowLine({ now }: { now: Date }) {
  return (
    <div className="relative z-10 flex items-center gap-2 py-1" aria-hidden>
      <span className="bg-brand text-brand-foreground rounded-[2px] px-1 py-px font-mono text-[9px] leading-none tabular-nums">
        {timeFmt.format(now)}
      </span>
      <span className="bg-brand h-px flex-1" />
    </div>
  );
}

/**
 * One class in the day block. Opens the shared O5 roster (mark present/absent,
 * mark all, walk-ins) rather than sending the owner off to another screen. State
 * reads off the rail: a finished class dims, one that finished with no register
 * is tagged, and the now-line above or below says which one is running.
 */
function DayRow({
  c,
  mine,
  unmarked,
  now,
  onOpen,
}: {
  c: ClassRow;
  mine: boolean;
  unmarked: boolean;
  now: Date;
  onOpen: () => void;
}) {
  const full = capacityDisplay(c.bookingCount, c.capacity).isOver;
  const ended = classEndsAt(c) <= now.getTime();
  const { clock, period } = clockParts(c.startsAt);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="hover:bg-muted focus-visible:border-ring focus-visible:ring-ring/50 -mx-2.5 flex w-[calc(100%+1.25rem)] items-center gap-3 rounded-sm px-2.5 py-2.5 text-left text-sm focus-visible:ring-[3px] focus-visible:outline-none"
    >
      <span
        aria-hidden
        className={cn(
          "relative z-10 size-2 shrink-0 rounded-full",
          disciplineDot(c.discipline),
        )}
      />
      <span className="text-muted-foreground shrink-0 font-mono whitespace-nowrap tabular-nums">
        {clock}
        {period && <span className="ml-1 text-[10px]">{period}</span>}
      </span>
      <span
        className={cn(
          "flex-1 font-medium",
          ended && !unmarked && "text-muted-foreground",
        )}
      >
        {c.title}
      </span>
      {unmarked && (
        <span className="text-warning border-warning/40 shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium">
          Unmarked
        </span>
      )}
      {mine ? (
        <span className="border-brand/40 text-brand-strong shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium">
          You
        </span>
      ) : (
        c.instructorName && (
          <span className="text-muted-foreground hidden shrink-0 text-xs sm:block">
            {c.instructorName}
          </span>
        )
      )}
      <span
        className={`font-mono text-xs tabular-nums ${full ? "text-warning" : "text-muted-foreground"}`}
      >
        {c.bookingCount}/{c.capacity}
        {c.pendingCount > 0 ? ` · +${c.pendingCount}` : ""}
      </span>
    </button>
  );
}

type Dashboard = RouterOutputs["stats"]["dashboard"];
type GymInsights = Dashboard["insights"];
type BusiestClass = GymInsights["busiest"][number];
type DriftMember = NonNullable<Dashboard["drifting"]>[number];

/**
 * The health block: a handful of numbers, each carrying the baseline that gives
 * it meaning. Money leads for an owner and is absent for an instructor, who is
 * never shown payments. "Visits this month" is gone — a part-month count says
 * less than the weekly pulse, and its own baseline (last month) sits outside the
 * 30-day read this block is built on. The rate keeps no comparison because a
 * 30-day window has nothing to compare itself against. A currency shows up only
 * once the gym has confirmed money in it, so a gym that takes no payments here
 * sees no money row rather than a zero.
 */
function Insights({
  data,
  revenue,
}: {
  data: GymInsights;
  revenue: NonNullable<Dashboard["revenue"]>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        {revenue.map((m) => (
          <Stat
            key={m.currency}
            value={formatMoney(m.amountMinor, m.currency)}
            label="Confirmed this month"
            delta={m.amountMinor - m.previousMinor}
            deltaLabel="last month"
            formatDelta={(size) => formatMoney(size, m.currency)}
          />
        ))}
        <Stat
          value={data.visitsThisWeek}
          label="Visits this week"
          delta={data.visitsThisWeek - data.visitsLastWeek}
          deltaLabel="last week"
        />
        {data.newMembers && (
          <Stat
            value={data.newMembers.thisMonth}
            label="New members this month"
            delta={data.newMembers.thisMonth - data.newMembers.lastMonth}
            deltaLabel="last month"
          />
        )}
        {data.attendanceRate !== null && (
          <Stat
            value={`${Math.round(data.attendanceRate * 100)}%`}
            label="Attendance rate · 30d"
          />
        )}
      </div>
      {data.busiest.length > 0 && (
        <div className="flex flex-col gap-1">
          <Eyebrow>Busiest classes · 30d</Eyebrow>
          {data.busiest.slice(0, 3).map((b) => (
            <BusiestRow
              key={b.title}
              row={b}
              top={data.busiest[0]?.count ?? b.count}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A class in the busiest list is drawn as a bar of its own share. Three bare
 * numbers made the reader do the arithmetic; the length says it at a glance.
 */
const BAR_SKIN: Record<DisciplineTone, string> = {
  gi: "bg-gi/20",
  nogi: "bg-nogi/20",
  other: "bg-muted",
};

function BusiestRow({ row, top }: { row: BusiestClass; top: number }) {
  const share = top > 0 ? Math.max(row.count / top, 0.04) : 0;
  return (
    <div className="relative flex items-center justify-between gap-3 px-2.5 py-1.5 text-sm">
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 rounded-[2px]",
          BAR_SKIN[disciplineTone(row.discipline)],
        )}
        style={{ width: `${share * 100}%` }}
      />
      <span className="relative font-medium">{row.title}</span>
      <span className="text-muted-foreground relative font-mono text-xs tabular-nums">
        {row.count}
      </span>
    </div>
  );
}

/** One "who's drifting" row — links to the member's detail (C.2). */
function DriftRow({ m, today }: { m: DriftMember; today: Date }) {
  const days = daysSince(
    m.lastAttendance ? new Date(m.lastAttendance) : null,
    today,
  );
  return (
    <Link
      href={`/members?member=${m.memberId}`}
      className={cn(
        cardClass({ variant: "outline", interactive: true }),
        "flex items-center justify-between gap-3 p-3",
      )}
    >
      <div className="flex flex-col">
        <span className="font-medium">{m.name}</span>
        <span className="text-muted-foreground text-sm">
          {days != null
            ? `Last trained ${days} days ago`
            : "No recent sessions"}
        </span>
      </div>
      <DriftBadge drift={m.drift} className="shrink-0" />
    </Link>
  );
}

function QuickAction({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Button asChild variant="outline" size="sm">
      <Link href={href}>{children}</Link>
    </Button>
  );
}
