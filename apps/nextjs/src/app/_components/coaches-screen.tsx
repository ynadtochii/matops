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
import { isPendingCoach, runsBranch } from "@matops/domain";
import { cn } from "@matops/ui";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import { toast } from "@matops/ui/toast";

import { monthDayFmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { Avatar } from "./avatar";
import { useEntity } from "./entity";
import { PageHeader } from "./page-header";
import {
  ENTER,
  Eyebrow,
  LIST,
  RESOLVE,
  SectionHeading,
  Stat,
} from "./primitives";
import { SkeletonRows } from "./skeletons";
import { Staff } from "./staff";
import { EmptyState, ErrorState } from "./states";
import { Tabs } from "./tabs";

type CoachRow = RouterOutputs["stats"]["coaches"]["coaches"][number];

const WINDOW_TABS: { id: CoachWindowKey; label: string }[] = [
  { id: "this_month", label: "This month" },
  { id: "last_month", label: "Last month" },
  { id: "last_90_days", label: "Last 90 days" },
];

function CoachWorkloadRow({ row }: { row: CoachRow }) {
  return (
    <div className="grid items-center gap-4 p-4 sm:grid-cols-[minmax(0,1.5fr)_minmax(15rem,2fr)]">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar
          edge
          name={row.name}
          src={row.avatarUrl}
          className="text-2xs size-8"
        />
        <div className="min-w-0">
          <p className="truncate font-medium">{row.name}</p>
          {!row.onStaff && <Eyebrow>No longer staff</Eyebrow>}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Stat value={row.classesLed} label="classes led" />
        <Stat
          value={
            <span className={cn(row.unresolvedEnded > 0 && "text-warning")}>
              {row.unresolvedEnded}
            </span>
          }
          label="needs review"
        />
        <Stat value={row.cancelled} label="cancelled" />
      </div>
    </div>
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
      queryClient.invalidateQueries(trpc.stats.navigationSummary.pathFilter()),
    ]);
  const onError = (err: { message: string }) =>
    toast.error(
      err.message ||
        "Couldn't finish that. Check your connection and try again.",
    );

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
  if (memberList.isPending) return null;
  if (memberList.isError) {
    return (
      <ErrorState
        label="coach requests"
        onRetry={() => void memberList.refetch()}
      />
    );
  }
  if (waiting.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <SectionHeading count={waiting.length}>Coach requests</SectionHeading>
      <ul className={LIST}>
        {waiting.map((m) => {
          const busy =
            (approve.isPending && approve.variables.memberId === m.memberId) ||
            (reject.isPending && reject.variables.memberId === m.memberId);
          return (
            <li
              key={m.memberId}
              className="flex min-h-11 flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Avatar
                  edge
                  name={m.name}
                  src={m.avatarUrl}
                  className="text-2xs size-8"
                />
                <div className="min-w-0">
                  <p className="truncate font-medium">{m.name}</p>
                  <p className="text-muted-foreground truncate text-sm">
                    {m.email} · wants to join as instructor
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  busy={
                    approve.isPending &&
                    approve.variables.memberId === m.memberId
                  }
                  disabled={busy}
                  onClick={() => approve.mutate({ memberId: m.memberId })}
                >
                  Approve
                </Button>
                <ConfirmDialog
                  title={`Decline ${m.name}?`}
                  description="They won't join the gym. You can send them the instructor link again later."
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
            </li>
          );
        })}
      </ul>
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
    ? `${monthDayFmt.format(new Date(range.from))} - ${monthDayFmt.format(
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

      <div className="flex flex-col gap-8">
        {isOwner && (
          <div className={ENTER}>
            <PendingCoaches />
          </div>
        )}

        <div
          className={cn(
            "grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-10",
            ENTER,
            isOwner && "delay-100",
          )}
        >
          <section
            className={cn(
              "flex min-w-0 flex-col gap-4 transition-opacity duration-200 motion-reduce:transition-none",
              stale && "opacity-60",
            )}
          >
            <SectionHeading
              action={
                rangeLabel ? (
                  <Eyebrow className="tabular-nums">{rangeLabel}</Eyebrow>
                ) : undefined
              }
            >
              {isOwner ? "Coach workload" : "Your workload"}
            </SectionHeading>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Tabs
                label="Window"
                value={window}
                onChange={setWindow}
                tabs={WINDOW_TABS}
              />
            </div>

            {isOwner ? (
              roster.isPending ? (
                <SkeletonRows rows={3} action inList />
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
                <div className={cn(LIST, RESOLVE)}>
                  {coaches.map((row) => (
                    <CoachWorkloadRow key={row.instructorId} row={row} />
                  ))}
                </div>
              )
            ) : mine.isPending ? (
              <SkeletonRows rows={1} action inList />
            ) : mine.isError ? (
              <ErrorState
                label="your classes"
                onRetry={() => void mine.refetch()}
              />
            ) : (
              <div className={cn(LIST, RESOLVE)}>
                <CoachWorkloadRow
                  row={{
                    ...mine.data.workload,
                    name: mine.data.name,
                    avatarUrl: mine.data.avatarUrl,
                    onStaff: true,
                  }}
                />
              </div>
            )}
          </section>

          {isOwner && (
            <aside className={cn("min-w-0", ENTER, "delay-200")}>
              <Staff />
            </aside>
          )}
        </div>
      </div>
    </>
  );
}
