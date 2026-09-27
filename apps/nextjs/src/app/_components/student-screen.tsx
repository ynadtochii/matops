"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import {
  capacityDisplay,
  groupByDay,
  spotsLeftLabel,
  studentWeekWindow,
} from "@matops/domain";
import { cn } from "@matops/ui";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Badge } from "@matops/ui/badge";
import { Button } from "@matops/ui/button";
import { Callout } from "@matops/ui/callout";
import { FOCUS_RING } from "@matops/ui/motion";

import { dayKey, dayMediumFmt, timeFmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { useEntity, useEntityHref } from "./entity";
import { InstallAppCard } from "./install-app-card";
import { PageHeader } from "./page-header";
import { disciplineDot, ENTER, LIST } from "./primitives";
import { SkeletonRows } from "./skeletons";
import { EmptyState, ErrorState, SuspendedState } from "./states";
import { useBooking } from "./use-booking";
import { useMinuteClock } from "./use-clock";

type ClassRow = RouterOutputs["class"]["mine"][number];

const STAGGER = ["", "delay-100", "delay-200"];

export function StudentScreen() {
  const trpc = useTRPC();
  const href = useEntityHref();
  const { book, cancel, busyFor, lockedMessage } = useBooking();
  const academy = useEntity();
  const suspended = academy.status === "suspended";

  const now = useMinuteClock();
  const todayKey = dayKey(now);

  const week = useQuery(
    trpc.class.mine.queryOptions(studentWeekWindow(now), {
      enabled: !suspended,
    }),
  );

  // The window is snapped to a UTC day so the server and the browser build the
  // same cache key. Filtering here is what keeps the list to seven local days.
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
        subtitle={`Find and book a class for the next ${academy.bookingWindowDays} days.`}
        action={
          <Button asChild variant="outline">
            <Link href={href("/training")}>My bookings</Link>
          </Button>
        }
      />
      {lockedMessage && (
        <Callout tone="warning" title="Booking unavailable" className="mb-6">
          <p>{lockedMessage}</p>
          {academy.membershipEnforced && (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="mt-2 self-start"
            >
              <Link href={href("/payments")}>View membership</Link>
            </Button>
          )}
        </Callout>
      )}
      {week.isPending ? (
        <SkeletonRows rows={3} action inList />
      ) : week.isError ? (
        <ErrorState label="your schedule" onRetry={() => void week.refetch()} />
      ) : byDay.length === 0 ? (
        <EmptyState title="No classes this week.">
          Your gym will show new classes here when they are scheduled.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          {byDay.map(([key, rows], i) => {
            const upcoming = rows.filter((c) => new Date(c.startsAt) > now);
            const earlier = rows.filter((c) => new Date(c.startsAt) <= now);
            const renderRow = (c: ClassRow) => (
              <ClassRowCard
                key={c.id}
                c={c}
                now={now}
                busy={busyFor(c.id)}
                locked={!!lockedMessage}
                onBook={() => book.mutate({ classId: c.id })}
                onCancel={() => cancel.mutate({ classId: c.id })}
              />
            );
            return (
              <section
                key={key}
                aria-labelledby={`day-${key}`}
                className={cn(
                  "border-border grid gap-4 border-t pt-5 lg:grid-cols-[9rem_minmax(0,1fr)] lg:gap-8",
                  ENTER,
                  STAGGER[Math.min(i, 2)],
                )}
              >
                <div>
                  <h2 id={`day-${key}`} className="text-md font-semibold">
                    {key === todayKey
                      ? "Today"
                      : dayMediumFmt.format(new Date(`${key}T12:00:00`))}
                  </h2>
                  {key === todayKey && (
                    <p className="text-muted-foreground mt-1 text-sm">
                      {dayMediumFmt.format(now)}
                    </p>
                  )}
                  <p className="text-muted-foreground mt-1 text-sm">
                    {rows.length} {rows.length === 1 ? "class" : "classes"}
                  </p>
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  {upcoming.length > 0 && (
                    <div className={LIST}>{upcoming.map(renderRow)}</div>
                  )}
                  {upcoming.length === 0 && (
                    <p className="text-muted-foreground py-2 text-sm">
                      No more classes today.
                    </p>
                  )}
                  {earlier.length > 0 && (
                    <details className="group">
                      <summary
                        className={cn(
                          "text-muted-foreground hover:text-foreground flex min-h-11 cursor-pointer items-center rounded-sm text-sm transition-colors motion-reduce:transition-none",
                          FOCUS_RING,
                        )}
                      >
                        Earlier today ({earlier.length})
                      </summary>
                      <div className={cn(LIST, "mt-1")}>
                        {earlier.map(renderRow)}
                      </div>
                    </details>
                  )}
                </div>
              </section>
            );
          })}
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
  const href = useEntityHref();
  const start = new Date(c.startsAt);
  const cancelled = c.status === "cancelled";
  const booked = c.myBooking === "booked";
  const past = start.getTime() <= now.getTime();
  const full = capacityDisplay(c.bookingCount, c.capacity).isOver;

  return (
    <div
      className={cn(
        "hover:bg-hover flex flex-wrap items-center justify-between gap-4 px-4 py-3 transition-colors motion-reduce:transition-none max-sm:flex-col max-sm:items-stretch lg:flex-nowrap",
      )}
    >
      <Link
        href={href(`/class/${c.id}`)}
        className={cn(
          "flex min-w-0 flex-1 items-start gap-3 rounded-sm",
          FOCUS_RING,
        )}
      >
        <span
          aria-hidden
          className={cn(
            "mt-1.5 size-2 shrink-0 rounded-full",
            disciplineDot(c.discipline),
          )}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="text-md shrink-0 font-medium tabular-nums">
              {timeFmt.format(start)}
            </span>
            <span
              className={cn(
                "text-md min-w-0 font-semibold break-words",
                cancelled && "line-through",
              )}
            >
              {c.title}
            </span>
          </span>
          <span className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {c.discipline && <span className="text-xs">{c.discipline}</span>}
            {c.instructorName && <span>{c.instructorName}</span>}
            {cancelled ? (
              <span className="text-error-text font-medium">Cancelled</span>
            ) : (
              <span className="tabular-nums">
                {spotsLeftLabel(c.capacity, c.bookingCount)}
              </span>
            )}
            {booked && !cancelled && <Badge tone="info">Booked</Badge>}
          </span>
        </span>
      </Link>

      {cancelled || past ? null : booked ? (
        <Button
          variant="outline"
          size="sm"
          busy={busy}
          disabled={busy}
          className="max-sm:w-full"
          aria-label={`Cancel booking for ${c.title} at ${timeFmt.format(start)}`}
          onClick={onCancel}
        >
          Cancel booking
        </Button>
      ) : full ? (
        <ConfirmDialog
          title="This class looks full"
          description="Your gym decides the real limit, so you can still book. Ask them if you are not sure."
          confirmLabel="Book anyway"
          variant="primary"
          onConfirm={onBook}
          trigger={
            <Button
              variant="secondary"
              size="sm"
              busy={busy}
              className="max-sm:w-full"
              aria-label={`Book ${c.title} at ${timeFmt.format(start)}`}
              disabled={busy || locked}
            >
              Book class
            </Button>
          }
        />
      ) : (
        <Button
          size="sm"
          busy={busy}
          disabled={busy || locked}
          className="max-sm:w-full"
          aria-label={`Book ${c.title} at ${timeFmt.format(start)}`}
          onClick={onBook}
        >
          Book class
        </Button>
      )}
    </div>
  );
}
