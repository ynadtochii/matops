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
import { formatMatTime, isPendingCoach, runsBranch } from "@matops/domain";
import { cn } from "@matops/ui";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import { toast } from "@matops/ui/toast";

import { monthDayFmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { useEntity } from "./entity";
import { PageHeader } from "./page-header";
import {
  cardClass,
  ENTER,
  Eyebrow,
  RESOLVE,
  SectionHeading,
  Stat,
} from "./primitives";
import { SkeletonCoachCards } from "./skeletons";
import { Staff } from "./staff";
import { EmptyState, ErrorState } from "./states";
import { Tabs } from "./tabs";

type CoachRow = RouterOutputs["stats"]["coaches"]["coaches"][number];

const WINDOW_TABS: { id: CoachWindowKey; label: string }[] = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "last_90_days", label: "Last 90 days" },
];

function CoachCard({ row }: { row: CoachRow }) {
  const average =
    row.avgHeadcount === null ? (
      <span className="text-muted-foreground text-sm">Not recorded</span>
    ) : (
      new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(
        row.avgHeadcount,
      )
    );

  return (
    <article className={cn(cardClass(), "flex flex-col gap-4")}>
      <p className="font-medium">
        {row.name}
        {!row.onStaff && (
          <span className="text-muted-foreground ml-2 font-mono text-xs uppercase">
            no longer staff
          </span>
        )}
      </p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
        <Stat value={row.classesLed} label="classes led" />
        <Stat value={formatMatTime(row.minutesLed)} label="time coached" />
        <Stat value={average} label="avg. recorded attendance" />
      </div>
      <div className="text-muted-foreground space-y-1 border-t border-dashed pt-3 text-xs">
        <p>
          {row.classesLed === 0
            ? "No completed classes in this period."
            : `Attendance recorded for ${row.markedClasses} of ${row.classesLed} classes.`}
        </p>
        {row.cancelled > 0 && (
          <p>
            {row.cancelled} {row.cancelled === 1 ? "class" : "classes"}{" "}
            cancelled.
          </p>
        )}
      </div>
    </article>
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
  const memberList = useQuery(
    trpc.membership.members.queryOptions({ audience: "all" }),
  );

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries(trpc.membership.members.pathFilter()),
      queryClient.invalidateQueries(trpc.membership.staff.pathFilter()),
      queryClient.invalidateQueries(
        trpc.stats.organizationMembers.pathFilter(),
      ),
    ]);
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

  const me = useEntity();
  const isOwner = runsBranch(me);
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

  const coaches = [...(roster.data?.coaches ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
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
            ? "Coaching workload and class attendance."
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
                  {coaches.map((row) => (
                    <CoachCard key={row.instructorId} row={row} />
                  ))}
                </div>
              )
            ) : mine.isPending ? (
              <SkeletonCoachCards n={1} />
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
