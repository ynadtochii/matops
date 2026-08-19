"use client";

import type { ReactNode } from "react";
import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import type { DisciplineTone } from "@matops/domain";
import {
  capacityDisplay,
  disciplineTone,
  groupMoneyByCurrency,
  isOwner as isOwnerOf,
  isStaff as isStaffOf,
  needsAttendance,
  UNMARKED_LOOKBACK_DAYS,
} from "@matops/domain";
import { cn } from "@matops/ui";
import { Button } from "@matops/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@matops/ui/dialog";

import { formatMoney } from "~/lib/money";
import { useTRPC } from "~/trpc/react";
import { ClassRoster } from "./class-roster";
import { PageHeader } from "./page-header";
import { cardClass, DriftBadge, Eyebrow, Section, Stat } from "./primitives";
import { EmptyState, ErrorState, SkeletonRows } from "./states";
import { StudentScreen } from "./student-screen";

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
const endsAt = (c: ClassRow) =>
  new Date(c.startsAt).getTime() + c.durationMinutes * 60 * 1000;
const sameDay = (value: Date | string, d: Date) => {
  const x = new Date(value);
  return (
    x.getFullYear() === d.getFullYear() &&
    x.getMonth() === d.getMonth() &&
    x.getDate() === d.getDate()
  );
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
  return only ? formatMoney(only.amountMinor, only.currency) : null;
}

/**
 * O1 Dashboard — the "run the week" command center (ticket 03). A "needs you"
 * action queue (every item is a blocker that can be driven to zero), a couple of
 * glanceable numbers, today's classes, insights, and who's drifting. Instructors
 * get the schedule half without the owner-only queue.
 */
export function DashboardScreen() {
  const trpc = useTRPC();
  const current = useQuery(trpc.academy.current.queryOptions());
  const [detailId, setDetailId] = useState<string | null>(null);

  const c = current.data;
  const isOwner = c ? isOwnerOf(c) : false;
  const isStaff = c ? isStaffOf(c) : false;

  const { weekFrom, weekTo, today, tomorrow, leadsSince } = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    const end = new Date(t);
    end.setDate(end.getDate() + 7);
    // Reaches back over the unmarked look-back so one read covers both halves of
    // the page: the week ahead and the finished classes still missing a register.
    const start = new Date(t);
    start.setDate(start.getDate() - UNMARKED_LOOKBACK_DAYS - 1);
    const since = new Date(t);
    since.setDate(since.getDate() - 6);
    const next = new Date(t);
    next.setDate(next.getDate() + 1);
    return {
      weekFrom: start.toISOString(),
      weekTo: end.toISOString(),
      today: t,
      tomorrow: next,
      leadsSince: since,
    };
  }, []);
  // The query window is a query key, so it stays frozen. The clock is not, and
  // freezing it left a long-open tab calling an ended class "now".
  const now = new Date();

  const week = useQuery({
    ...trpc.class.week.queryOptions({ from: weekFrom, to: weekTo }),
    enabled: isStaff,
  });
  const memberList = useQuery({
    ...trpc.membership.members.queryOptions(),
    enabled: isOwner,
  });
  const leads = useQuery({
    ...trpc.dropIn.list.queryOptions(),
    enabled: isOwner,
  });
  const claims = useQuery({
    ...trpc.payments.claims.queryOptions(),
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
  const revenue = useQuery({
    ...trpc.stats.revenue.queryOptions(),
    enabled: isOwner,
  });

  if (current.isPending) return <SkeletonRows rows={5} />;
  if (current.isError || !c)
    return (
      <ErrorState
        label="your dashboard"
        onRetry={() => void current.refetch()}
      />
    );

  if (!isStaff) {
    return <StudentScreen academyName={c.name} status={c.status} />;
  }

  const onDay = (d: Date) =>
    (week.data ?? [])
      .filter((r) => sameDay(r.startsAt, d) && r.status !== "cancelled")
      .sort(
        (a, b) =>
          new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
      );
  const todays = onDay(today);
  const tomorrows = onDay(tomorrow);
  // Once today's last class has ended the day block is a log, not a plan. Roll
  // it forward — anything still needing a mark is already in the queue above.
  const showTomorrow =
    todays.every((r) => endsAt(r) <= now.getTime()) && tomorrows.length > 0;
  const dayList = showTomorrow ? tomorrows : todays;
  // The list is sorted, so the count of already-started classes IS the index the
  // now-line belongs at. Tomorrow has no "now".
  const nowIndex = showTomorrow
    ? null
    : dayList.filter((r) => new Date(r.startsAt).getTime() <= now.getTime())
        .length;
  const members = memberList.data ?? [];
  const pendingCount = members.filter((m) => m.status === "pending").length;
  const activeCount = members.filter((m) => m.status === "active").length;
  const overdue = members.filter((m) => m.dues?.status === "overdue");
  const weekCount = (week.data ?? []).filter(
    (r) => r.status !== "cancelled" && new Date(r.startsAt) >= today,
  ).length;
  const unmarked = (week.data ?? []).filter((r) =>
    needsAttendance({ ...r, startsAt: new Date(r.startsAt) }, now),
  );
  const unmarkedIds = new Set(unmarked.map((r) => r.id));
  // Only the last week's leads count as "new": `drop_in` has no handled flag, so
  // an all-time count could never reach zero and the queue would read as
  // permanently dirty.
  const newLeads = (leads.data ?? []).filter(
    (l) => new Date(l.lastVisitAt) >= leadsSince,
  ).length;

  const queue: QueueItem[] = [
    {
      key: "attendance",
      href: "/attendance",
      count: unmarked.length,
      label: "Classes to mark",
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
            key: "approvals",
            href: "/members?tab=requests",
            count: pendingCount,
            label: "Pending approvals",
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
    (isOwner && (memberList.isPending || leads.isPending || claims.isPending));
  const numbersLoading = week.isPending || (isOwner && memberList.isPending);

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
        <PageHeader title="This week" subtitle={dateFmt.format(today)} />

        {/* Needs you — one instrument panel, divided by hairlines. The violet
            lives in the counts only: it is a spark, not a surface (design.md §1.1). */}
        {queueLoading ? (
          <div className="bg-muted h-24 animate-pulse rounded-lg motion-reduce:animate-none" />
        ) : queue.length === 0 ? (
          <div className="border-border bg-grid-small rounded-lg border border-dashed p-6">
            <p className="text-sm font-medium">All clear.</p>
            <p className="text-muted-foreground mt-1 text-sm">
              {isOwner
                ? "Every class is marked, everyone is approved, every payment is settled."
                : "Every class is marked."}
            </p>
          </div>
        ) : (
          <div className="border-border bg-grid-small divide-border flex flex-col divide-y overflow-hidden rounded-lg border sm:flex-row sm:divide-x sm:divide-y-0">
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
          <div className="bg-muted mt-3 h-3 w-56 animate-pulse rounded-sm motion-reduce:animate-none" />
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
          <SkeletonRows rows={2} />
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
        {insights.isPending ? (
          <SkeletonRows rows={2} />
        ) : insights.isError ? (
          <ErrorState
            label="gym insights"
            onRetry={() => void insights.refetch()}
          />
        ) : (
          <Insights
            data={insights.data}
            isOwner={isOwner}
            revenue={revenue.data ?? []}
          />
        )}
      </Section>

      {/* Who's drifting — members who used to train and have gone quiet */}
      {isOwner && (
        <Section
          label="Who's drifting"
          meta={
            drifting.isPending || drifting.isError || drifting.data.length === 0
              ? undefined
              : `${drifting.data.length} members`
          }
        >
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
 * One reading on the queue panel: a mono count over a mono label. Same shell as
 * the O9 referral metrics band — a bordered strip on the hairline grid with each
 * cell floated just above it — so the two instrument panels in the app read as
 * one thing. The ring is inset because the strip clips its corners.
 */
function QueueSegment({ href, count, label, sub }: Omit<QueueItem, "key">) {
  return (
    <Link
      href={href}
      className="bg-background/90 hover:bg-muted focus-visible:ring-ring/50 flex-1 p-4 transition-colors focus-visible:ring-[3px] focus-visible:outline-none focus-visible:ring-inset"
    >
      <p className="text-brand-strong font-mono text-2xl leading-none tabular-nums">
        {count}
      </p>
      <p className="text-muted-foreground mt-2 font-mono text-[11px] tracking-wider uppercase">
        {label}
      </p>
      {sub && (
        <p className="text-muted-foreground/70 mt-1 font-mono text-[11px] tabular-nums">
          {sub} outstanding
        </p>
      )}
    </Link>
  );
}

/**
 * Which discipline a class is, as a dot on the time rail. A dot rather than a
 * tinted row: a list of tinted bars would drown the page, and the category is a
 * whisper, not the point.
 */
const DOT_SKIN: Record<DisciplineTone, string> = {
  gi: "bg-gi",
  nogi: "bg-nogi",
  other: "border-border bg-background border",
};

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
  const ended = endsAt(c) <= now.getTime();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="hover:bg-muted focus-visible:border-ring focus-visible:ring-ring/50 flex w-full items-center gap-3 py-2.5 text-left text-sm focus-visible:ring-[3px] focus-visible:outline-none"
    >
      <span
        aria-hidden
        className={cn(
          "relative z-10 size-2 shrink-0 rounded-full",
          DOT_SKIN[disciplineTone(c.discipline)],
        )}
      />
      <span className="text-muted-foreground w-11 shrink-0 font-mono tabular-nums">
        {timeFmt.format(new Date(c.startsAt))}
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

type GymInsights = RouterOutputs["stats"]["gym"];
type BusiestClass = GymInsights["busiest"][number];
type DriftMember = RouterOutputs["stats"]["drifting"][number];

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
  isOwner,
  revenue,
}: {
  data: GymInsights;
  isOwner: boolean;
  revenue: RouterOutputs["stats"]["revenue"];
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
        {isOwner && (
          <Stat
            value={data.newMembersThisMonth}
            label="New members this month"
            delta={data.newMembersThisMonth - data.newMembersLastMonth}
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
    <div className="relative flex items-center justify-between gap-3 py-1.5 text-sm">
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
  const days = m.lastAttendance
    ? Math.floor(
        (today.getTime() - new Date(m.lastAttendance).getTime()) /
          (24 * 60 * 60 * 1000),
      )
    : null;
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
