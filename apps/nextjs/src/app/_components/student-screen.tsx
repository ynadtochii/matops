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
import { Button } from "@matops/ui/button";

import { dayKey, dayMediumFmt, timeFmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { useEntity, useEntityHref } from "./entity";
import { InstallAppCard } from "./install-app-card";
import { PageHeader } from "./page-header";
import { cardClass, disciplineDot, ENTER } from "./primitives";
import { SkeletonClassDays } from "./skeletons";
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
        <div className="border-warning/30 bg-warning/10 mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
          <div className="min-w-0">
            <p className="font-medium">Booking unavailable</p>
            <p className="text-muted-foreground mt-1 text-sm">
              {lockedMessage}
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={href("/payments")}>View membership</Link>
          </Button>
        </div>
      )}
      {week.isPending ? (
        <SkeletonClassDays />
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
                  <h2 id={`day-${key}`} className="text-base font-semibold">
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
                  {upcoming.map(renderRow)}
                  {upcoming.length === 0 && (
                    <p className="text-muted-foreground py-2 text-sm">
                      No more classes today.
                    </p>
                  )}
                  {earlier.length > 0 && (
                    <details className="group">
                      <summary className="text-muted-foreground focus-visible:outline-brand cursor-pointer rounded-sm py-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-4">
                        Earlier today ({earlier.length})
                      </summary>
                      <div className="flex flex-col gap-2 pt-1">
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
        cardClass({ interactive: true }),
        "flex flex-wrap items-center justify-between gap-4 lg:flex-nowrap",
      )}
    >
      <Link
        href={href(`/class/${c.id}`)}
        className="focus-visible:outline-brand flex min-w-0 flex-1 items-start gap-3 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4"
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
            <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">
              {timeFmt.format(start)}
            </span>
            <span
              className={cn(
                "min-w-0 text-base font-semibold break-words",
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
        <Button
          variant="outline"
          size="sm"
          busy={busy}
          disabled={busy}
          aria-label={`Cancel booking for ${c.title} at ${timeFmt.format(start)}`}
          onClick={onCancel}
        >
          Cancel booking
        </Button>
      ) : full ? (
        <ConfirmDialog
          title="This class looks full"
          description="Your gym manages the room, so you can still book it."
          confirmLabel="Book anyway"
          variant="primary"
          onConfirm={onBook}
          trigger={
            <Button
              variant="secondary"
              size="sm"
              busy={busy}
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
          aria-label={`Book ${c.title} at ${timeFmt.format(start)}`}
          onClick={onBook}
        >
          Book class
        </Button>
      )}
    </div>
  );
}
