"use client";

import { useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import type { CoachWindowKey } from "@matops/domain";
import {
  DAY_LABELS,
  formatMatTime,
  isOwner as isOwnerOf,
  isPendingCoach,
} from "@matops/domain";
import { cn } from "@matops/ui";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@matops/ui/collapsible";
import { toast } from "@matops/ui/toast";

import { dateTimeFmt, monthDayFmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { useEntity } from "./entity";
import { PageHeader } from "./page-header";
import {
  cardClass,
  ChevronDownIcon,
  ENTER,
  Eyebrow,
  RESOLVE,
  SectionHeading,
  Stat,
  Tabs,
} from "./primitives";
import { SkeletonBreakdown, SkeletonCoachCards } from "./skeletons";
import { Staff } from "./staff";
import { EmptyState, ErrorState } from "./states";

type CoachRow = RouterOutputs["stats"]["coaches"]["coaches"][number];
type CoachDetailData = RouterOutputs["stats"]["coach"];
type Breakdown = CoachDetailData["breakdown"];

const WINDOW_TABS: { id: CoachWindowKey; label: string }[] = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "last_90_days", label: "Last 90 days" },
];

const percent = (rate: number | null) =>
  rate === null ? "—" : `${Math.round(rate * 100)}%`;
const headcount = (avg: number | null) =>
  avg === null ? "—" : (Math.round(avg * 10) / 10).toString();

/** A row of bars sharing one scale, for the weekday and per-week breakdowns. */
function BarRow({
  bars,
  label,
}: {
  bars: { key: string; caption: string; value: number }[];
  label: string;
}) {
  const peak = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <ul className="mt-2 flex items-end gap-1.5">
        {bars.map((b) => (
          <li key={b.key} className="flex flex-1 flex-col items-center gap-1">
            <span className="font-mono text-[10px] tabular-nums">
              {b.value || ""}
            </span>
            <span
              aria-hidden
              className="bg-muted-foreground/40 w-full rounded-sm"
              style={{ height: `${Math.max(2, (b.value / peak) * 40)}px` }}
            />
            <span className="text-muted-foreground font-mono text-[10px]">
              {b.caption}
            </span>
            <span className="sr-only">
              {b.caption}: {b.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const RECENT_SHOWN = 8;

function BreakdownPanel({ breakdown }: { breakdown: Breakdown }) {
  if (breakdown.recent.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No classes led in this window. Pick a wider window, or set this coach on
        a class from the schedule.
      </p>
    );
  }
  const hidden = breakdown.recent.length - RECENT_SHOWN;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <Eyebrow>Which classes</Eyebrow>
        <ul className="mt-2 flex flex-col gap-1">
          {breakdown.byClass.map((g) => (
            <li
              key={g.title}
              className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm"
            >
              <span>
                {g.title}
                {g.discipline && (
                  <span className="text-muted-foreground ml-2 text-xs uppercase">
                    {g.discipline}
                  </span>
                )}
              </span>
              <span className="text-muted-foreground font-mono text-xs tabular-nums">
                {g.classesLed}× · avg {headcount(g.avgHeadcount)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <BarRow
          label="By weekday"
          bars={breakdown.byWeekday.map((value, i) => ({
            key: String(i),
            caption: DAY_LABELS[i] ?? "",
            value,
          }))}
        />
        <BarRow
          label="By week"
          bars={breakdown.byWeek.map((w, i) => ({
            key: String(w.weekBucket),
            caption: `w${i + 1}`,
            value: w.classesLed,
          }))}
        />
      </div>

      <div>
        <Eyebrow>Classes led</Eyebrow>
        <ul className="mt-2 flex flex-col gap-1">
          {breakdown.recent.slice(0, RECENT_SHOWN).map((c) => (
            <li
              key={c.classId}
              className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm"
            >
              <span>
                <span className="text-muted-foreground font-mono text-xs tabular-nums">
                  {dateTimeFmt.format(new Date(c.startsAt))}
                </span>{" "}
                {c.title}
              </span>
              <span className="text-muted-foreground font-mono text-xs tabular-nums">
                {c.marked ? `${c.headcount} present` : "not marked"}
              </span>
            </li>
          ))}
        </ul>
        {hidden > 0 && (
          <p className="text-muted-foreground mt-1.5 font-mono text-[10px] tracking-wide uppercase tabular-nums">
            + {hidden} more in this window
          </p>
        )}
      </div>
    </div>
  );
}

function CoachDetail({
  instructorId,
  window,
}: {
  instructorId: string | undefined;
  window: CoachWindowKey;
}) {
  const trpc = useTRPC();
  const detail = useQuery({
    ...trpc.stats.coach.queryOptions({ window, instructorId }),
    placeholderData: keepPreviousData,
  });
  if (detail.isPending) return <SkeletonBreakdown />;
  if (detail.isError) {
    return (
      <ErrorState
        label="this coach's classes"
        onRetry={() => void detail.refetch()}
      />
    );
  }
  return <BreakdownPanel breakdown={detail.data.breakdown} />;
}

/**
 * One coach's numbers. Cards are never ordered by headcount: a 07:00 class
 * fills less than a 19:00 one whoever teaches it, so ranking coaches that way
 * would measure the timeslot and read as a performance review.
 */
function CoachCard({
  row,
  window,
  open,
  onToggle,
  breakdown,
}: {
  row: CoachRow;
  window: CoachWindowKey;
  open: boolean;
  onToggle?: () => void;
  /** Already loaded — the own-card view has it, the roster fetches on expand. */
  breakdown?: Breakdown;
}) {
  const partial = row.markedRate !== null && row.markedRate < 1;
  const body = breakdown ? (
    <BreakdownPanel breakdown={breakdown} />
  ) : (
    <CoachDetail instructorId={row.instructorId} window={window} />
  );
  return (
    <Collapsible
      open={open}
      onOpenChange={onToggle}
      className={cn(cardClass(), "flex flex-col gap-4")}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          {row.name}
          {!row.onStaff && (
            <span className="text-muted-foreground ml-2 font-mono text-xs uppercase">
              no longer staff
            </span>
          )}
        </p>
        {onToggle && (
          <CollapsibleTrigger asChild>
            <Button size="sm" variant="outline">
              Breakdown
              <ChevronDownIcon
                className={cn(
                  "transition-[rotate] duration-200 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none",
                  open && "rotate-180",
                )}
              />
            </Button>
          </CollapsibleTrigger>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Stat value={row.classesLed} label="classes led" />
        <Stat value={formatMatTime(row.minutesLed)} label="on the mat" />
        <Stat value={row.distinctStudents} label="students" />
        <Stat value={headcount(row.avgHeadcount)} label="avg headcount" />
        <Stat value={percent(row.markedRate)} label="attendance marked" />
      </div>

      {partial && (
        <p className="text-muted-foreground text-xs">
          {row.classesLed - row.markedClasses} of {row.classesLed} classes have
          no attendance marked, so the headcount above covers only the marked
          ones.
        </p>
      )}
      {row.cancelled > 0 && (
        <p className="text-muted-foreground text-xs">
          {row.cancelled} class{row.cancelled === 1 ? "" : "es"} cancelled in
          this window.
        </p>
      )}

      {onToggle ? <CollapsibleContent>{body}</CollapsibleContent> : body}
    </Collapsible>
  );
}

/**
 * Coach join requests (spec O10). Someone who opened the instructor link waits
 * here, not in the Members requests tab: approving them grants the schedule and
 * attendance tools, which is a staffing call, not a student one.
 */
function PendingCoaches() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const memberList = useQuery(trpc.membership.members.queryOptions());

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.membership.members.pathFilter());
  const onError = (err: { message: string }) =>
    toast.error(err.message || "Action failed");

  const approve = useMutation(
    trpc.membership.approve.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        await queryClient.invalidateQueries(trpc.stats.pathFilter());
        toast.success("Coach approved");
      },
      onError,
    }),
  );
  const reject = useMutation(
    trpc.membership.reject.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Request declined");
      },
      onError,
    }),
  );

  const waiting = (memberList.data ?? []).filter(isPendingCoach);
  if (memberList.isPending || memberList.isError || waiting.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading count={waiting.length}>Coach requests</SectionHeading>
      {waiting.map((m) => {
        const busy =
          (approve.isPending && approve.variables.memberId === m.memberId) ||
          (reject.isPending && reject.variables.memberId === m.memberId);
        return (
          <div
            key={m.memberId}
            className={cn(
              cardClass(),
              "flex flex-wrap items-center justify-between gap-3",
            )}
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{m.name}</p>
              <p className="text-muted-foreground truncate text-sm">
                {m.email} · wants to join as instructor
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                busy={busy && approve.isPending}
                disabled={busy}
                onClick={() => approve.mutate({ memberId: m.memberId })}
              >
                Approve
              </Button>
              <ConfirmDialog
                title={`Decline ${m.name}?`}
                description="They won't join the academy. You can send them the instructor link again later."
                confirmLabel="Decline request"
                variant="destructive"
                onConfirm={async () => {
                  await reject.mutateAsync({ memberId: m.memberId });
                }}
                trigger={
                  <Button
                    size="sm"
                    variant="destructive-outline"
                    disabled={busy}
                  >
                    Decline
                  </Button>
                }
              />
            </div>
          </div>
        );
      })}
    </section>
  );
}

/**
 * O10 Coaches (spec O10). Workload and coverage per coach: classes led, time on
 * the mat, who they taught, and how much of it actually got marked.
 *
 * An owner sees every coach. An instructor sees only their own card — the same
 * role split ADR 38/52 draws everywhere else, so the screen reads as recognition
 * rather than a review of colleagues.
 */
export function CoachesScreen() {
  const trpc = useTRPC();
  const [window, setWindow] = useState<CoachWindowKey>("this_month");
  const [openId, setOpenId] = useState<string | null>(null);

  const me = useEntity();
  const isOwner = isOwnerOf(me);
  const roster = useQuery({
    ...trpc.stats.coaches.queryOptions({ window }),
    enabled: isOwner,
    placeholderData: keepPreviousData,
  });
  const mine = useQuery({
    ...trpc.stats.coach.queryOptions({ window }),
    enabled: !isOwner,
    placeholderData: keepPreviousData,
  });

  const stale = isOwner ? roster.isPlaceholderData : mine.isPlaceholderData;
  const range = isOwner ? roster.data?.range : mine.data?.range;
  const rangeLabel = range
    ? `${monthDayFmt.format(new Date(range.from))} – ${monthDayFmt.format(
        new Date(new Date(range.to).getTime() - 1),
      )}`
    : undefined;

  return (
    <>
      <PageHeader
        title="Coaches"
        subtitle={
          isOwner
            ? "Who taught what, and how much of it got marked."
            : "Your classes, your time on the mat."
        }
      />

      <div className="flex flex-col gap-10">
        {isOwner && (
          <div className={ENTER}>
            <PendingCoaches />
          </div>
        )}

        <div className={cn(ENTER, isOwner && "delay-100")}>
          <div
            className={cn(
              "flex flex-col gap-4 transition-opacity duration-200 motion-reduce:transition-none",
              stale && "opacity-60",
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Tabs
                label="Window"
                value={window}
                onChange={setWindow}
                tabs={WINDOW_TABS}
              />
              {rangeLabel && <Eyebrow>{rangeLabel}</Eyebrow>}
            </div>

            {isOwner ? (
              roster.isPending ? (
                <SkeletonCoachCards n={3} />
              ) : roster.isError ? (
                <ErrorState
                  label="your coaches"
                  onRetry={() => void roster.refetch()}
                />
              ) : roster.data.coaches.length === 0 ? (
                <EmptyState title="No coaches yet.">
                  Share the instructor link below, then set the coach on each
                  class.
                </EmptyState>
              ) : (
                <div className={cn("flex flex-col gap-4", RESOLVE)}>
                  {roster.data.coaches.map((row) => (
                    <CoachCard
                      key={row.instructorId}
                      row={row}
                      window={window}
                      open={openId === row.instructorId}
                      onToggle={() =>
                        setOpenId(
                          openId === row.instructorId ? null : row.instructorId,
                        )
                      }
                    />
                  ))}
                </div>
              )
            ) : mine.isPending ? (
              <SkeletonCoachCards n={1} toggle={false} />
            ) : mine.isError ? (
              <ErrorState
                label="your classes"
                onRetry={() => void mine.refetch()}
              />
            ) : (
              <div className={RESOLVE}>
                <CoachCard
                  row={{
                    ...mine.data.workload,
                    name: mine.data.name,
                    onStaff: true,
                  }}
                  window={window}
                  breakdown={mine.data.breakdown}
                  open
                />
              </div>
            )}
          </div>
        </div>

        {isOwner && (
          <div className={cn(ENTER, "delay-200")}>
            <Staff />
          </div>
        )}
      </div>
    </>
  );
}
