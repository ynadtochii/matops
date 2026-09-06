"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import {
  DAY_LABELS,
  lastClassLabel,
  nextClass,
  splitMyClasses,
} from "@matops/domain";
import { cn } from "@matops/ui";
import { Button } from "@matops/ui/button";

import { dayMediumFmt, timeFmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { useEntity, useEntityHref } from "./entity";
import { PageHeader } from "./page-header";
import { cardClass, ENTER, SectionHeading, Stat } from "./primitives";
import { SkeletonMyClassesBody, SkeletonStats } from "./skeletons";
import { EmptyState, ErrorState, SuspendedState } from "./states";
import { Tabs } from "./tabs";
import { useBooking } from "./use-booking";
import { useMinuteClock } from "./use-clock";

type MyClass = RouterOutputs["booking"]["mine"][number];

export function MyClassesScreen() {
  const [view, setView] = useState<"upcoming" | "attended">("upcoming");
  const href = useEntityHref();
  const trpc = useTRPC();
  const { cancel, busyFor } = useBooking();
  const suspended = useEntity().status === "suspended";

  const mine = useQuery({
    ...trpc.booking.mine.queryOptions(),
    enabled: !suspended,
  });

  const now = useMinuteClock();
  const { upcoming, past } = splitMyClasses(mine.data ?? [], now);
  const next = nextClass(
    upcoming.filter((c) => c.status !== "cancelled"),
    now,
  );

  const header = (
    <PageHeader
      title="My classes"
      subtitle="Manage your bookings and review the classes you attended."
      action={
        <Button asChild variant="outline">
          <Link href={href("/")}>Browse schedule</Link>
        </Button>
      }
    />
  );

  if (suspended) {
    return (
      <>
        {header}
        <SuspendedState />
      </>
    );
  }

  const classes = view === "upcoming" ? upcoming : past;

  return (
    <>
      {header}
      {mine.isPending ? (
        <SkeletonMyClassesBody />
      ) : mine.isError ? (
        <ErrorState label="your classes" onRetry={() => void mine.refetch()} />
      ) : (
        <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <section className={cn(ENTER, "min-w-0 space-y-5")}>
            <Tabs
              label="My classes views"
              value={view}
              onChange={setView}
              tabs={[
                { id: "upcoming", label: `Upcoming (${upcoming.length})` },
                { id: "attended", label: `Attended (${past.length})` },
              ]}
            />
            <h2 className="sr-only">
              {view === "upcoming" ? "Upcoming bookings" : "Classes attended"}
            </h2>
            {view === "attended" && (
              <p className="text-muted-foreground text-sm">
                Classes appear here after your gym records your attendance.
              </p>
            )}
            {classes.length === 0 ? (
              <EmptyState
                title={
                  view === "upcoming"
                    ? "No upcoming bookings"
                    : "No attendance recorded yet"
                }
                action={
                  view === "upcoming" ? (
                    <Button asChild size="sm">
                      <Link href={href("/")}>Find a class</Link>
                    </Button>
                  ) : undefined
                }
              >
                {view === "upcoming"
                  ? "Choose your next session from the schedule."
                  : "Your gym records attendance after each class."}
              </EmptyState>
            ) : (
              <ul className="flex flex-col gap-3">
                {classes.map((c) => (
                  <li key={c.classId}>
                    <ClassRow
                      c={c}
                      next={view === "upcoming" && c.classId === next?.classId}
                      action={
                        view === "upcoming" && c.status !== "cancelled" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            aria-label={`Cancel booking for ${c.title} on ${dayMediumFmt.format(c.startsAt)}`}
                            busy={busyFor(c.classId)}
                            disabled={busyFor(c.classId)}
                            onClick={() =>
                              cancel.mutate({ classId: c.classId })
                            }
                          >
                            Cancel booking
                          </Button>
                        ) : undefined
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
          <aside className="min-w-0 space-y-4 xl:border-l xl:pl-8">
            <SectionHeading>My training</SectionHeading>
            <TrainingStats />
          </aside>
        </div>
      )}
    </>
  );
}

function ClassRow({
  c,
  next,
  action,
}: {
  c: MyClass;
  next: boolean;
  action?: React.ReactNode;
}) {
  const href = useEntityHref();
  const cancelled = c.status === "cancelled";
  return (
    <div
      className={cn(
        cardClass(),
        "flex flex-wrap items-center justify-between gap-4",
        next && "border-brand/30 bg-brand-wash",
      )}
    >
      <Link
        href={href(`/class/${c.classId}`)}
        className="hover:text-brand focus-visible:outline-brand min-w-0 flex-1 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4"
      >
        {next && (
          <p className="text-brand mb-2 text-xs font-semibold">Next class</p>
        )}
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-mono text-sm font-semibold tabular-nums">
            {timeFmt.format(c.startsAt)}
          </span>
          <span
            className={cn(
              "min-w-0 font-semibold break-words",
              cancelled && "line-through",
            )}
          >
            {c.title}
          </span>
        </p>
        <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span>{dayMediumFmt.format(c.startsAt)}</span>
          {c.discipline && <span className="text-xs">{c.discipline}</span>}
          {cancelled && (
            <span className="text-error font-medium">Cancelled</span>
          )}
          {c.bookingTier === "provisional" && !cancelled && (
            <span className="text-xs">Pending approval</span>
          )}
        </p>
      </Link>
      {action}
    </div>
  );
}

function TrainingStats() {
  const trpc = useTRPC();
  const stats = useQuery(trpc.stats.me.queryOptions());

  if (stats.isPending) {
    return (
      <div className={cardClass()}>
        <SkeletonStats n={3} />
      </div>
    );
  }
  if (stats.isError) {
    return (
      <ErrorState
        label="your training stats"
        onRetry={() => void stats.refetch()}
      />
    );
  }

  const s = stats.data;
  if (s.total === 0) {
    return (
      <EmptyState title="Your training starts here">
        Your totals update when your gym records your attendance.
      </EmptyState>
    );
  }

  const favorite = [
    s.favoriteDiscipline?.toUpperCase(),
    s.favoriteWeekday != null ? DAY_LABELS[s.favoriteWeekday] : undefined,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className={cardClass()}>
      <div className="grid grid-cols-3 gap-4">
        <Stat value={s.total} label="Sessions" />
        <Stat value={s.thisMonth} label="This month" />
        <Stat value={s.streakWeeks} label="Week streak" />
      </div>
      {(favorite || s.daysSinceLastClass != null) && (
        <div className="mt-5 flex flex-col gap-1 text-sm">
          {favorite && (
            <p>
              Favorite: <span className="font-medium">{favorite}</span>
            </p>
          )}
          {s.daysSinceLastClass != null && (
            <p className="text-muted-foreground">
              Last class: {lastClassLabel(s.daysSinceLastClass)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
