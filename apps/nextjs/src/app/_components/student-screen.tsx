"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import {
  capacityDisplay,
  dayWindow,
  groupByDay,
  spotsLeftLabel,
} from "@matops/domain";
import { cn } from "@matops/ui";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import { Spinner } from "@matops/ui/spinner";

import { dayKey, dayMediumFmt, timeFmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { useAcademy } from "./academy";
import { InstallAppCard } from "./install-app-card";
import { PageHeader } from "./page-header";
import { cardClass, disciplineDot, Section } from "./primitives";
import { SkeletonClassDays } from "./skeletons";
import { EmptyState, ErrorState, SuspendedState } from "./states";
import { useBooking } from "./use-booking";

type ClassRow = RouterOutputs["class"]["mine"][number];

export function StudentScreen() {
  const trpc = useTRPC();
  const { book, cancel, busyFor, lockedMessage } = useBooking();
  const suspended = useAcademy().status === "suspended";

  const { from, to, todayKey } = useMemo(() => {
    const { from: start, to: end } = dayWindow(new Date(), {
      aheadDays: 7,
    });
    return {
      from: start.toISOString(),
      to: end.toISOString(),
      todayKey: dayKey(start),
    };
  }, []);

  const week = useQuery(
    trpc.class.mine.queryOptions({ from, to }, { enabled: !suspended }),
  );

  const now = new Date();

  const byDay = useMemo(() => groupByDay(week.data ?? []), [week.data]);

  if (suspended) {
    return (
      <>
        <PageHeader title="Schedule" />
        <SuspendedState />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Schedule"
        subtitle="Your classes for the next seven days."
      />
      {week.isPending ? (
        <SkeletonClassDays />
      ) : week.isError ? (
        <ErrorState label="your schedule" onRetry={() => void week.refetch()} />
      ) : byDay.length === 0 ? (
        <EmptyState title="No classes this week.">
          Check back soon — your gym adds classes here as they schedule them.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          {byDay.map(([key, rows]) => (
            <Section
              key={key}
              label={
                key === todayKey
                  ? "Today"
                  : dayMediumFmt.format(new Date(`${key}T12:00:00`))
              }
              meta={`${rows.length} ${rows.length === 1 ? "class" : "classes"}`}
            >
              <div className="flex flex-col gap-2">
                {rows.map((c) => (
                  <ClassRowCard
                    key={c.id}
                    c={c}
                    now={now}
                    busy={busyFor(c.id)}
                    locked={!!lockedMessage}
                    onBook={() => book.mutate({ classId: c.id })}
                    onCancel={() => cancel.mutate({ classId: c.id })}
                  />
                ))}
              </div>
            </Section>
          ))}
        </div>
      )}
      <div className="mt-8">
        <InstallAppCard />
      </div>
    </>
  );
}

function ClassRowCard({
  c,
  now,
  busy,
  locked,
  onBook,
  onCancel,
}: {
  c: ClassRow;
  now: Date;
  busy: boolean;
  locked: boolean;
  onBook: () => void;
  onCancel: () => void;
}) {
  const start = new Date(c.startsAt);
  const cancelled = c.status === "cancelled";
  const booked = c.myBooking === "booked";
  const past = start.getTime() <= now.getTime();
  const full = capacityDisplay(c.bookingCount, c.capacity).isOver;

  return (
    <div
      className={cn(
        cardClass({ interactive: true }),
        "flex flex-wrap items-center justify-between gap-3",
        cancelled && "opacity-60",
        past && !cancelled && "opacity-70",
      )}
    >
      <Link
        href={`/class/${c.id}`}
        className="flex min-w-0 flex-1 items-start gap-3"
      >
        <span
          aria-hidden
          className={cn(
            "mt-1.5 size-2 shrink-0 rounded-full",
            disciplineDot(c.discipline),
          )}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-baseline gap-2">
            <span className="font-mono text-sm font-semibold tabular-nums">
              {timeFmt.format(start)}
            </span>
            <span
              className={cn(
                "truncate font-medium",
                cancelled && "line-through",
              )}
            >
              {c.title}
            </span>
          </span>
          <span className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {c.discipline && (
              <span className="font-mono text-[10px] tracking-wide uppercase">
                {c.discipline}
              </span>
            )}
            {c.instructorName && <span>{c.instructorName}</span>}
            {cancelled ? (
              <span className="text-error font-medium">Cancelled</span>
            ) : (
              <span className="font-mono text-xs">
                {spotsLeftLabel(c.capacity, c.bookingCount)}
              </span>
            )}
            {booked && !cancelled && (
              <span className="bg-brand-wash text-brand-strong rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide uppercase">
                Booked
              </span>
            )}
          </span>
        </span>
      </Link>

      {cancelled || past ? null : booked ? (
        <Button variant="outline" size="sm" disabled={busy} onClick={onCancel}>
          {busy && <Spinner size="sm" className="text-current" />}
          Cancel
        </Button>
      ) : full ? (
        <ConfirmDialog
          title="This class looks full"
          description="Your gym manages the room, so you can still book it."
          confirmLabel="Book anyway"
          variant="primary"
          onConfirm={onBook}
          trigger={
            <Button variant="secondary" size="sm" disabled={busy || locked}>
              {busy && <Spinner size="sm" className="text-current" />}
              Book
            </Button>
          }
        />
      ) : (
        <Button size="sm" disabled={busy || locked} onClick={onBook}>
          {busy && <Spinner size="sm" className="text-current" />}
          Book
        </Button>
      )}
    </div>
  );
}
