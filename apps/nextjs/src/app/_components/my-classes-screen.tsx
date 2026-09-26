"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import { nextClass, splitMyClasses } from "@matops/domain";
import { cn } from "@matops/ui";
import { Badge } from "@matops/ui/badge";
import { Button } from "@matops/ui/button";
import { FOCUS_RING } from "@matops/ui/motion";

import { dayMediumFmt, timeFmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { useEntity, useEntityHref } from "./entity";
import { PageHeader } from "./page-header";
import { ENTER, LIST } from "./primitives";
import { SkeletonMyClassesBody } from "./skeletons";
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
            <ul className={LIST}>
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
                          className="max-sm:w-full"
                          aria-label={`Cancel booking for ${c.title} on ${dayMediumFmt.format(c.startsAt)}`}
                          busy={busyFor(c.classId)}
                          disabled={busyFor(c.classId)}
                          onClick={() => cancel.mutate({ classId: c.classId })}
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
    <div className="hover:bg-hover flex flex-wrap items-center justify-between gap-4 px-4 py-3 transition-colors motion-reduce:transition-none max-sm:flex-col max-sm:items-stretch">
      <Link
        href={href(`/class/${c.classId}`)}
        className={cn("min-w-0 flex-1 rounded-sm", FOCUS_RING)}
      >
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-md font-medium tabular-nums">
            {timeFmt.format(c.startsAt)}
          </span>
          <span
            className={cn(
              "text-md min-w-0 font-semibold break-words",
              cancelled && "line-through",
            )}
          >
            {c.title}
          </span>
          {next && <Badge tone="info">Next class</Badge>}
        </p>
        <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span>{dayMediumFmt.format(c.startsAt)}</span>
          {c.discipline && <span className="text-xs">{c.discipline}</span>}
          {cancelled && (
            <span className="text-error-text font-medium">Cancelled</span>
          )}
          {c.bookingTier === "provisional" && !cancelled && (
            <Badge>Pending approval</Badge>
          )}
        </p>
      </Link>
      {action}
    </div>
  );
}
