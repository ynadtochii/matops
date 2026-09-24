"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import {
  branchWords,
  capacityDisplay,
  classEndsAt,
  dashboardWeekWindow,
  dayPlan,
  daysSince,
  dayWindow,
  isBjjAcademy,
  isFirstRun,
  isStaff as isStaffOf,
  leadQueues,
  rosterSummary,
  runsBranch,
  startOfDay,
  upcomingClassCount,
} from "@matops/domain";
import { cn } from "@matops/ui";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@matops/ui/dialog";
import { FOCUS_RING, FOCUS_RING_INSET, PRESS } from "@matops/ui/motion";

import { clockParts, dayLongFmt, timeFmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { ClassRoster } from "./class-roster";
import { useEntity, useEntityHref } from "./entity";
import { PageHeader } from "./page-header";
import {
  cardClass,
  disciplineDot,
  DriftBadge,
  ENTER,
  Panel,
  panelCell,
  PanelNotice,
  RESOLVE,
  Section,
  TAP,
} from "./primitives";
import { Bar, SkeletonDayRail, SkeletonQueue, SkeletonRows } from "./skeletons";
import { EmptyState, ErrorState } from "./states";
import { StudentScreen } from "./student-screen";
import { useMinuteClock } from "./use-clock";

type ClassRow = Omit<RouterOutputs["class"]["week"][number], "startsAt"> & {
  startsAt: Date;
};

const listFmt = new Intl.ListFormat("en", {
  style: "long",
  type: "conjunction",
});

const DRIFT_SHOWN = 6;

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
/**
 * O1 Dashboard — the "run the week" command center (ticket 03). A "needs you"
 * action queue (every item is a blocker that can be driven to zero), a couple of
 * glanceable numbers, today's classes, insights, and who's drifting. Instructors
 * get the schedule half without the owner-only queue.
 */
export function DashboardScreen() {
  const href = useEntityHref();
  const trpc = useTRPC();
  const c = useEntity();
  const [detailId, setDetailId] = useState<string | null>(null);

  const isOwner = runsBranch(c);
  const isStaff = isStaffOf(c);
  const bjj = isBjjAcademy(c.type);
  const words = branchWords(c.type);

  const { today, tomorrow } = useMemo(() => {
    const at = new Date();
    return {
      today: startOfDay(at),
      tomorrow: dayWindow(at, { aheadDays: 1 }).to,
    };
  }, []);
  // The query window is a query key, so it stays frozen. The clock is not, and
  // freezing it left a long-open tab calling an ended class "now".
  const now = useMinuteClock();

  const week = useQuery({
    ...trpc.class.week.queryOptions(dashboardWeekWindow(now)),
    enabled: isStaff,
  });
  const attendance = useQuery({
    ...trpc.attendance.reviewQueue.queryOptions({
      status: "needs_review",
      offset: 0,
    }),
    enabled: isStaff,
    refetchInterval: 60_000,
  });
  const memberList = useQuery({
    ...trpc.membership.members.queryOptions({ audience: "all" }),
    enabled: isStaff,
  });
  const leads = useQuery({
    ...trpc.dropIn.list.queryOptions(),
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
  } = rosterSummary(members);
  const weekCount = upcomingClassCount(weekRows, today);
  const unmarked = weekRows.filter(
    (r) =>
      r.status !== "cancelled" &&
      classEndsAt(r) <= now.getTime() &&
      !r.attendanceReviewed,
  );
  const unmarkedIds = new Set(unmarked.map((r) => r.id));
  const { newLeads, trainedNotJoined } = leadQueues(
    (leads.data ?? []).map((l) => ({
      stage: l.stage,
      activity: {
        visits: l.visitCount,
        lastVisitAt: l.lastVisitAt ? new Date(l.lastVisitAt) : null,
        nextBookingAt: l.nextBookingAt ? new Date(l.nextBookingAt) : null,
      },
    })),
  );

  const queue: QueueItem[] = [
    {
      key: "attendance",
      href: href("/attendance"),
      count: attendance.data?.needsReview ?? 0,
      label: "Classes to review",
    },
    {
      key: "approvals",
      href: href("/members?tab=requests"),
      count: pendingCount,
      label: "Pending approvals",
    },
    ...(!isOwner
      ? []
      : [
          {
            key: "coach-requests",
            href: href("/coaches"),
            count: pendingCoaches,
            label: "Coach requests",
          },
          {
            key: "leads",
            href: href("/members?tab=leads&stage=new"),
            count: newLeads,
            label: "New drop-in leads",
          },
          {
            key: "leads-trained",
            href: href("/members?tab=leads&stage=trained"),
            count: trainedNotJoined,
            label: "Trained, not joined",
          },
        ]),
  ].filter((i) => i.count > 0);

  // Don't show "0" while the numbers are still loading — a skeleton reads as
  // "counting", a bare 0 reads as "nothing to do".
  const queueLoading =
    week.isPending ||
    attendance.isPending ||
    memberList.isPending ||
    (isOwner && leads.isPending);
  const numbersLoading = week.isPending || memberList.isPending;
  const firstRun = isOwner && isFirstRun(activeCount, weekCount);

  // A query that failed must never read as a job at zero, so the panel names
  // what it could not check instead of claiming the queue is clear.
  const queueErrors: { label: string; retry: () => void }[] = [];
  if (attendance.isError)
    queueErrors.push({
      label: `${words.sessionPlural} to review`,
      retry: () => void attendance.refetch(),
    });
  if (memberList.isError)
    queueErrors.push({
      label: "pending approvals",
      retry: () => void memberList.refetch(),
    });
  if (isOwner && leads.isError)
    queueErrors.push({
      label: "drop-in leads",
      retry: () => void leads.refetch(),
    });

  const driftList = dash.data?.drifting ?? [];

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

      <div className={ENTER}>
        <PageHeader title="Dashboard" subtitle={dayLongFmt.format(today)} />

        {/* Needs you — one instrument panel of equal channels on a hairline
            grid; a job at zero is dropped, not drawn empty. The violet lives in
            the counts only: it is a spark, not a surface (design.md §1.1). */}
        {queueLoading ? (
          <SkeletonQueue />
        ) : (
          <Panel className={RESOLVE} cols={Math.max(queue.length, 1)}>
            {firstRun ? (
              <PanelNotice
                title={`This ${words.branch} is empty. ${
                  bjj ? "Three" : "Two"
                } steps to open it.`}
              >
                <Link
                  href={href("/schedule")}
                  className="text-brand-strong font-medium"
                >
                  {bjj
                    ? "1. Add your weekly classes"
                    : "1. Add your weekly sessions"}
                </Link>
                {" · "}
                <Link
                  href={href("/members")}
                  className="text-brand-strong font-medium"
                >
                  2. Share your join link
                </Link>
                {/* The visitor poster is a BJJ path: a general space has no
                    drop-in form and no public booking (ADR 126), so offering
                    one would be a step that leads nowhere. */}
                {bjj && (
                  <>
                    {" · "}
                    <Link
                      href={href("/members?tab=leads")}
                      className="text-brand-strong font-medium"
                    >
                      3. Print the QR poster
                    </Link>
                  </>
                )}
              </PanelNotice>
            ) : (
              <>
                {queue.map((i) => (
                  <QueueSegment
                    key={i.key}
                    href={i.href}
                    count={i.count}
                    label={i.label}
                    sub={i.sub}
                  />
                ))}
                {queueErrors.length > 0 ? (
                  <PanelNotice
                    title={`Couldn't check ${listFmt.format(
                      queueErrors.map((e) => e.label),
                    )}.`}
                  >
                    <button
                      type="button"
                      onClick={() => queueErrors.forEach((e) => e.retry())}
                      className={cn(
                        "text-brand-strong font-medium underline underline-offset-4",
                        FOCUS_RING,
                        TAP,
                      )}
                    >
                      Try again
                    </button>
                  </PanelNotice>
                ) : (
                  queue.length === 0 && (
                    <PanelNotice title="All clear.">
                      {isOwner
                        ? `Every past ${words.session} reviewed, everyone approved, and no new leads.`
                        : `Every past ${words.session} reviewed and everyone approved.`}
                    </PanelNotice>
                  )
                )}
              </>
            )}
          </Panel>
        )}

        {/* Context, not readings — a caption under the panel, so the counts
            that need an action stay the only numbers competing for the eye. */}
        {numbersLoading ? (
          <Bar className="mt-3 h-3 w-56" />
        ) : (
          <p className="text-muted-foreground mt-3 font-mono text-[11px] tracking-wider uppercase tabular-nums">
            {isOwner && `${activeCount} active members · `}
            {weekCount} {words.sessionPlural} this week
          </p>
        )}
      </div>

      {/* Two columns only when there is a rail to fill: an instructor has no
          drifting list, so the day would otherwise sit in a 1fr column with
          20rem of nothing beside it. */}
      <div
        className={cn(
          "grid gap-10",
          isOwner && "lg:grid-cols-[minmax(0,1fr)_19rem]",
        )}
      >
        <div className={cn("flex flex-col gap-10", ENTER, "delay-100")}>
          {/* The day's classes — today until its last class ends, then tomorrow */}
          <Section
            label={showTomorrow ? "Tomorrow" : "Today"}
            meta={
              week.isPending || week.isError
                ? undefined
                : `${dayList.length} ${dayList.length === 1 ? words.session : words.sessionPlural}`
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
                title={`No ${words.sessionPlural} ${showTomorrow ? "tomorrow" : "today"}.`}
                action={
                  <Link
                    href={href("/schedule")}
                    className={cn(
                      "text-brand-strong text-sm font-medium",
                      FOCUS_RING,
                      TAP,
                    )}
                  >
                    Add a {words.session}
                  </Link>
                }
              >
                Enjoy the rest day, or add a one-off from the schedule.
              </EmptyState>
            ) : (
              <div className={cn("relative", RESOLVE)}>
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
        </div>

        {/* Who's drifting — members who used to train and have gone quiet.
            A column of names and one badge each, which is what the rail is
            the right width for. */}
        {isOwner && (
          <aside className={cn(ENTER, "delay-150")}>
            <Section
              label="Who's drifting"
              meta={
                dash.isPending || dash.isError || driftList.length === 0
                  ? undefined
                  : `${driftList.length} members`
              }
            >
              {dash.isPending ? (
                <SkeletonRows rows={3} />
              ) : dash.isError ? (
                <ErrorState
                  label="the drifting list"
                  onRetry={() => void dash.refetch()}
                />
              ) : driftList.length === 0 ? (
                <EmptyState title="Everyone's showing up.">
                  Members who trained here and went quiet appear here, so you
                  can reach out.
                </EmptyState>
              ) : (
                <div className={cn("flex flex-col gap-2", RESOLVE)}>
                  {driftList.slice(0, DRIFT_SHOWN).map((m) => (
                    <DriftRow key={m.memberId} m={m} today={today} />
                  ))}
                  {driftList.length > DRIFT_SHOWN && (
                    <Link
                      href={href("/members")}
                      className={cn(
                        "text-brand-strong self-start text-sm font-medium",
                        FOCUS_RING,
                        TAP,
                      )}
                    >
                      See all {driftList.length}
                    </Link>
                  )}
                </div>
              )}
            </Section>
          </aside>
        )}
      </div>
    </div>
  );
}

/**
 * One job on the queue: a mono count over a mono label. From `lg` up the strip
 * is always one row, so the channels divide the content column evenly however
 * many jobs there are; a label wider than its channel truncates rather than
 * wrapping the tile taller than its neighbours.
 */
function QueueSegment({ href, count, label, sub }: Omit<QueueItem, "key">) {
  return (
    <Link
      href={href}
      className={cn(
        panelCell,
        "group hover:bg-muted px-2.5 py-3 transition-[background-color,scale] duration-150",
        FOCUS_RING_INSET,
        PRESS,
      )}
    >
      <p className="text-brand-strong font-mono text-3xl leading-none tabular-nums">
        {count}
      </p>
      <p className="text-muted-foreground group-hover:text-foreground mt-2 truncate font-mono text-[10px] tracking-wide uppercase transition-colors">
        {label}
      </p>
      {sub && (
        <p className="text-muted-foreground/70 mt-1 truncate font-mono text-[10px] tabular-nums">
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
      className={cn(
        "hover:bg-muted -mx-2.5 flex min-h-11 w-[calc(100%+1.25rem)] items-center gap-3 rounded-sm px-2.5 py-2 text-left text-sm",
        FOCUS_RING,
        PRESS,
      )}
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
          "min-w-0 flex-1 truncate font-medium",
          ended && !unmarked && "text-muted-foreground",
        )}
      >
        {c.title}
      </span>
      {unmarked && (
        <span className="text-warning border-warning/40 shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium">
          Needs review
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
        className={cn(
          "shrink-0 font-mono text-xs tabular-nums",
          full ? "text-warning" : "text-muted-foreground",
        )}
      >
        {c.bookingCount}/{c.capacity}
        {c.pendingCount > 0 ? ` · +${c.pendingCount}` : ""}
      </span>
    </button>
  );
}

type Dashboard = RouterOutputs["stats"]["dashboard"];
type DriftMember = NonNullable<Dashboard["drifting"]>[number];

/** One "who's drifting" row — links to the member's detail (C.2). */
function DriftRow({ m, today }: { m: DriftMember; today: Date }) {
  const href = useEntityHref();
  const days = daysSince(
    m.lastAttendance ? new Date(m.lastAttendance) : null,
    today,
  );
  return (
    <Link
      href={href(`/members?member=${m.memberId}`)}
      className={cn(
        cardClass({ variant: "outline", interactive: true }),
        "flex min-h-11 flex-col gap-0.5 p-3",
        FOCUS_RING,
        PRESS,
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="truncate font-medium">{m.name}</span>
        <DriftBadge drift={m.drift} className="shrink-0" />
      </span>
      <span className="text-muted-foreground text-sm">
        {days != null ? `Last trained ${days} days ago` : "Hasn't trained yet"}
      </span>
    </Link>
  );
}
