"use client";

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
import { cardClass, ENTER, Section, Stat } from "./primitives";
import { SkeletonMyClassesBody, SkeletonStats } from "./skeletons";
import { EmptyState, ErrorState, SuspendedState } from "./states";
import { useBooking } from "./use-booking";
import { useMinuteClock } from "./use-clock";

type MyClass = RouterOutputs["booking"]["mine"][number];

export function MyClassesScreen() {
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
  const next = nextClass(upcoming, now);

  const header = (
    <PageHeader
      title="My classes"
      subtitle="What you booked, and what you have trained."
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

  const rest = upcoming.filter((c) => c.classId !== next?.classId);

  return (
    <>
      {header}
      {mine.isPending ? (
        <SkeletonMyClassesBody />
      ) : mine.isError ? (
        <ErrorState label="your classes" onRetry={() => void mine.refetch()} />
      ) : (
        <div className="flex flex-col gap-8">
          {next && (
            <Section label="Next class" className={ENTER}>
              <Link
                href={href(`/class/${next.classId}`)}
                className={cn(
                  cardClass({ interactive: true }),
                  "border-brand/30 bg-brand-wash block",
                )}
              >
                <p className="text-lg font-semibold">{next.title}</p>
                <p className="text-muted-foreground mt-1 text-sm">
                  {dayMediumFmt.format(next.startsAt)} ·{" "}
                  <span className="font-mono tabular-nums">
                    {timeFmt.format(next.startsAt)}
                  </span>
                </p>
                {next.bookingTier === "provisional" && (
                  <p className="text-muted-foreground mt-2 font-mono text-[10px] tracking-wide uppercase">
                    Pending approval
                  </p>
                )}
              </Link>
            </Section>
          )}

          <Section
            label="My training"
            className={cn(ENTER, next && "delay-100")}
          >
            <TrainingStats />
          </Section>

          <Section
            label="Upcoming"
            className={cn(ENTER, "delay-200")}
            meta={rest.length > 0 ? `${rest.length}` : undefined}
          >
            {rest.length === 0 ? (
              <EmptyState title="Nothing else booked yet.">
                Pick a class from the schedule.
              </EmptyState>
            ) : (
              <div className="flex flex-col gap-2">
                {rest.map((c) => (
                  <ClassRow
                    key={c.classId}
                    c={c}
                    now={now}
                    action={
                      c.status === "cancelled" ? undefined : (
                        <Button
                          variant="outline"
                          size="sm"
                          busy={busyFor(c.classId)}
                          disabled={busyFor(c.classId)}
                          onClick={() => cancel.mutate({ classId: c.classId })}
                        >
                          Cancel
                        </Button>
                      )
                    }
                  />
                ))}
              </div>
            )}
          </Section>

          <Section
            label="Past"
            className={cn(ENTER, "delay-200")}
            meta={past.length > 0 ? `${past.length}` : undefined}
          >
            {past.length === 0 ? (
              <EmptyState title="No sessions yet.">
                Your gym marks the roster after class.
              </EmptyState>
            ) : (
              <div className="flex flex-col gap-2">
                {past.map((c) => (
                  <ClassRow key={c.classId} c={c} now={now} />
                ))}
              </div>
            )}
          </Section>
        </div>
      )}
    </>
  );
}

function ClassRow({
  c,
  now,
  action,
}: {
  c: MyClass;
  now: Date;
  action?: React.ReactNode;
}) {
  const href = useEntityHref();
  const cancelled = c.status === "cancelled";
  const past = c.startsAt.getTime() <= now.getTime();
  return (
    <div
      className={cn(
        cardClass({ interactive: true }),
        "flex flex-wrap items-center justify-between gap-3",
        (cancelled || past) && "opacity-70",
      )}
    >
      <Link href={href(`/class/${c.classId}`)} className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-semibold tabular-nums">
            {timeFmt.format(c.startsAt)}
          </span>
          <span
            className={cn("truncate font-medium", cancelled && "line-through")}
          >
            {c.title}
          </span>
        </p>
        <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span>{dayMediumFmt.format(c.startsAt)}</span>
          {c.discipline && (
            <span className="font-mono text-[10px] tracking-wide uppercase">
              {c.discipline}
            </span>
          )}
          {cancelled && (
            <span className="text-error font-medium">Cancelled</span>
          )}
          {c.bookingTier === "provisional" && !cancelled && (
            <span className="font-mono text-[10px] tracking-wide uppercase">
              Pending approval
            </span>
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
      <EmptyState title="No sessions yet.">
        Train at your next class to start tracking.
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
