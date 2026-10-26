"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";

import type { RouterOutputs } from "@matops/api";
import {
  capacityDisplay,
  companyLabel,
  groupByDay,
  spotsLeftLabel,
  startsInLabel,
  studentWeekWindow,
} from "@matops/domain";
import { cn } from "@matops/ui";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Badge } from "@matops/ui/badge";
import { Button } from "@matops/ui/button";
import { Callout } from "@matops/ui/callout";
import { cardClass } from "@matops/ui/card";
import { Meter } from "@matops/ui/meter";
import { FOCUS_RING } from "@matops/ui/motion";

import {
  dayKey,
  dayMediumFmt,
  dayNumFmt,
  timeFmt,
  weekdayFmt,
} from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { ClassDropInLink } from "./class-drop-in-link";
import { useEntity, useEntityHref } from "./entity";
import { InstallAppCard } from "./install-app-card";
import { PageHeader } from "./page-header";
import { CountBadge, disciplineDot, ENTER, LIST } from "./primitives";
import { SkeletonRows } from "./skeletons";
import { EmptyState, ErrorState, SuspendedState } from "./states";
import { useBooking } from "./use-booking";
import { useMinuteClock } from "./use-clock";
import { useDisciplineHue } from "./use-discipline-hue";

type ClassRow = RouterOutputs["class"]["mine"][number];

interface BookProps {
  busy: boolean;
  locked: boolean;
  onBook: () => void;
  onCancel: () => void;
}

const LIT_BAR =
  "bg-foreground absolute inset-y-0 left-0 w-0.5 shadow-[0_0_10px_1px_color-mix(in_oklab,var(--color-foreground)_35%,transparent)]";

function dayName(key: string, todayKey: string, tomorrowKey: string) {
  if (key === todayKey) return "Today";
  if (key === tomorrowKey) return "Tomorrow";
  return dayMediumFmt.format(new Date(`${key}T12:00:00`));
}

export function StudentScreen() {
  const trpc = useTRPC();
  const href = useEntityHref();
  const { book, cancel, busyFor, locked, lockedMessage } = useBooking();
  const academy = useEntity();
  const suspended = academy.status === "suspended";

  const now = useMinuteClock();
  const todayKey = dayKey(now);
  const tomorrowKey = dayKey(new Date(now.getTime() + 86_400_000));

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
        <PageHeader title={academy.name} />
        <SuspendedState />
      </>
    );
  }

  const ahead = (week.data ?? []).filter(
    (c) => c.status !== "cancelled" && new Date(c.startsAt) > now,
  );
  const featuredKey = ahead[0] && dayKey(new Date(ahead[0].startsAt));
  const featured = ahead.filter(
    (c) => dayKey(new Date(c.startsAt)) === featuredKey,
  );
  const bookRow = (c: ClassRow): BookProps => ({
    busy: busyFor(c.id),
    locked,
    onBook: () => book.mutate({ classId: c.id }),
    onCancel: () => cancel.mutate({ classId: c.id }),
  });

  return (
    <>
      <PageHeader
        title={academy.name}
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
        <>
          {featuredKey && (
            <DayCarousel
              key={featuredKey}
              classes={featured}
              now={now}
              day={dayName(featuredKey, todayKey, tomorrowKey)}
              bookRow={bookRow}
            />
          )}

          <nav
            aria-label="Jump to a day"
            className="bg-background sticky top-0 z-10 -mx-1 mb-2 flex [scrollbar-width:none] gap-1 overflow-x-auto px-1 py-2 [&::-webkit-scrollbar]:hidden"
          >
            {byDay.map(([key, rows]) => {
              const date = new Date(`${key}T12:00:00`);
              const mine = rows.some(
                (c) => c.myBooking === "booked" && c.status !== "cancelled",
              );
              return (
                <a
                  key={key}
                  href={`#day-${key}`}
                  aria-label={`${dayName(key, todayKey, tomorrowKey)}, ${rows.length} ${rows.length === 1 ? "class" : "classes"}${mine ? ", you are booked" : ""}`}
                  className={cn(
                    "rounded-control flex min-h-11 shrink-0 items-center gap-2 border px-3 text-sm transition-colors motion-reduce:transition-none sm:min-h-9",
                    FOCUS_RING,
                    key === todayKey
                      ? "edge-lit-surface-2 text-foreground shadow-lift"
                      : "text-muted-foreground hover:bg-hover hover:text-foreground border-transparent",
                  )}
                >
                  <span>
                    {key === todayKey ? "Today" : weekdayFmt.format(date)}
                    {key !== todayKey && (
                      <span className="ml-1 tabular-nums">
                        {dayNumFmt.format(date)}
                      </span>
                    )}
                  </span>
                  <CountBadge>{rows.length}</CountBadge>
                  {mine && (
                    <span
                      aria-hidden
                      className="bg-foreground size-1.5 rounded-full"
                    />
                  )}
                </a>
              );
            })}
          </nav>

          <div className="flex flex-col gap-8">
            {byDay.map(([key, rows]) => {
              const upcoming = rows.filter((c) => new Date(c.startsAt) > now);
              const earlier = rows.filter((c) => new Date(c.startsAt) <= now);
              const renderRow = (c: ClassRow) => (
                <ClassRowCard key={c.id} c={c} now={now} {...bookRow(c)} />
              );
              return (
                <section
                  key={key}
                  id={`day-${key}`}
                  aria-labelledby={`day-heading-${key}`}
                  className="scroll-mt-16"
                >
                  <div className="mb-3 flex items-baseline gap-3">
                    <h2
                      id={`day-heading-${key}`}
                      className="text-md font-semibold"
                    >
                      {dayName(key, todayKey, tomorrowKey)}
                    </h2>
                    {key === todayKey && (
                      <p className="text-muted-foreground text-sm">
                        {dayMediumFmt.format(now)}
                      </p>
                    )}
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
        </>
      )}
      <div className="mt-8">
        <InstallAppCard />
      </div>
    </>
  );
}

function DayCarousel({
  classes,
  now,
  day,
  bookRow,
}: {
  classes: ClassRow[];
  now: Date;
  day: string;
  bookRow: (c: ClassRow) => BookProps;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [overflows, setOverflows] = useState(false);
  const firstBooked = useRef(
    Math.max(
      classes.findIndex((c) => c.myBooking === "booked"),
      0,
    ),
  );

  const slideLeft = (el: HTMLDivElement, i: number) =>
    ((el.children[i] as HTMLElement | undefined)?.offsetLeft ?? 0) -
    parseFloat(getComputedStyle(el).paddingLeft);

  const go = (i: number) => {
    const el = track.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    el.scrollTo({
      left: slideLeft(el, i),
      behavior: reduce.matches ? "auto" : "smooth",
    });
  };

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const observer = new ResizeObserver(() =>
      setOverflows(el.scrollWidth > el.clientWidth + 1),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (track.current)
      track.current.scrollLeft = slideLeft(track.current, firstBooked.current);
  }, []);

  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    if (el.scrollLeft >= el.scrollWidth - el.clientWidth - 2) {
      setIndex(classes.length - 1);
      return;
    }
    const offsets = classes.map((_, i) =>
      Math.abs(slideLeft(el, i) - el.scrollLeft),
    );
    setIndex(offsets.indexOf(Math.min(...offsets)));
  };

  const many = classes.length > 1;
  const paged = many && overflows;

  return (
    <section
      aria-roledescription="carousel"
      aria-labelledby="featured-day"
      className={cn("mb-6", ENTER)}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 id="featured-day" className="text-md font-semibold">
            {day}
          </h2>
          <p className="text-muted-foreground text-sm">
            {classes.length} {classes.length === 1 ? "class" : "classes"} to go
          </p>
        </div>
        {paged && (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Previous class"
              disabled={index === 0}
              onClick={() => go(index - 1)}
            >
              <ChevronLeft aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next class"
              disabled={index === classes.length - 1}
              onClick={() => go(index + 1)}
            >
              <ChevronRight aria-hidden />
            </Button>
          </div>
        )}
      </div>

      <div
        ref={track}
        onScroll={onScroll}
        className="relative -mx-6 flex snap-x snap-mandatory scroll-px-6 [scrollbar-width:none] gap-3 overflow-x-auto px-6 py-3 md:-mx-8 md:scroll-px-8 md:px-8 [&::-webkit-scrollbar]:hidden"
      >
        {classes.map((c, i) => (
          <FeaturedClass
            key={c.id}
            c={c}
            now={now}
            label={`${i + 1} of ${classes.length}`}
            wide={!many}
            {...bookRow(c)}
          />
        ))}
      </div>

      {paged && (
        <div className="mt-1 flex justify-center gap-1">
          {classes.map((c, i) => (
            <button
              key={c.id}
              type="button"
              aria-label={`Show ${timeFmt.format(new Date(c.startsAt))} ${c.title}`}
              aria-current={i === index}
              onClick={() => go(i)}
              className={cn(
                "flex size-6 items-center justify-center rounded-sm",
                FOCUS_RING,
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "h-1 rounded-full transition-all duration-200 motion-reduce:transition-none",
                  i === index ? "bg-foreground w-4" : "bg-track w-1.5",
                )}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function FeaturedClass({
  c,
  now,
  label,
  wide,
  ...props
}: BookProps & { c: ClassRow; now: Date; label: string; wide: boolean }) {
  const href = useEntityHref();
  const start = new Date(c.startsAt);
  const booked = c.myBooking === "booked";
  const startsIn = startsInLabel(start, now);

  return (
    <div
      role="group"
      aria-roledescription="slide"
      aria-label={label}
      className={cn(
        cardClass({ level: "raised" }),
        "relative flex shrink-0 snap-start flex-col overflow-hidden p-5",
        wide ? "w-full" : "w-[85%] sm:w-80",
      )}
    >
      {booked && <span aria-hidden className={LIT_BAR} />}
      <div className="flex items-start justify-between gap-3">
        <span className="flex items-baseline gap-2">
          <span className="text-3xl font-medium tracking-tight tabular-nums">
            {timeFmt.format(start)}
          </span>
          <span className="text-muted-foreground text-sm tabular-nums">
            {c.durationMinutes} min
          </span>
        </span>
        {booked && (
          <Badge>
            <Check aria-hidden />
            Booked
          </Badge>
        )}
      </div>
      <Link
        href={href(`/class/${c.id}`)}
        className={cn(
          "text-md mt-2 self-start rounded-sm font-semibold break-words after:absolute after:inset-0 hover:underline",
          FOCUS_RING,
        )}
      >
        {c.title}
      </Link>
      <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {c.instructorName && <span>with {c.instructorName}</span>}
        {c.discipline && <Discipline name={c.discipline} />}
      </p>
      {startsIn && (
        <p className="text-foreground-secondary mt-1 text-sm">{startsIn}</p>
      )}
      <div className="mt-auto flex flex-col gap-2 pt-5">
        <p className="text-muted-foreground text-sm tabular-nums">
          {booked
            ? companyLabel(c.bookingCount)
            : spotsLeftLabel(c.capacity, c.bookingCount)}
        </p>
        {c.capacity > 0 && (
          <Meter
            value={c.bookingCount}
            max={c.capacity}
            glow
            label={`${c.bookingCount} of ${c.capacity} spots taken`}
          />
        )}
      </div>
      <BookControl
        c={c}
        variant="primary"
        className="relative z-10 mt-4 w-full"
        {...props}
      />
    </div>
  );
}

function Discipline({ name }: { name: string }) {
  const { hueOf } = useDisciplineHue();
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden
        className={cn("size-2 rounded-full", disciplineDot(hueOf(name)))}
      />
      {name}
    </span>
  );
}

function BookControl({
  c,
  busy,
  locked,
  onBook,
  onCancel,
  variant = "secondary",
  className,
}: BookProps & {
  c: ClassRow;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const at = timeFmt.format(new Date(c.startsAt));
  if (c.myBooking === "booked") {
    return (
      <Button
        variant="outline"
        size="sm"
        busy={busy}
        disabled={busy}
        className={className}
        aria-label={`Cancel booking for ${c.title} at ${at}`}
        onClick={onCancel}
      >
        Cancel booking
      </Button>
    );
  }
  const full = capacityDisplay(c.bookingCount, c.capacity).isOver;
  const button = (
    <Button
      variant={variant}
      size="sm"
      busy={busy}
      disabled={busy || locked}
      className={className}
      aria-label={`Book ${c.title} at ${at}`}
      onClick={full ? undefined : onBook}
    >
      Book class
    </Button>
  );
  if (!full) return button;
  return (
    <ConfirmDialog
      title="This class looks full"
      description="Your gym decides the real limit, so you can still book. Ask them if you are not sure."
      confirmLabel="Book anyway"
      variant="primary"
      onConfirm={onBook}
      trigger={button}
    />
  );
}

function ClassRowCard({
  c,
  now,
  ...props
}: BookProps & { c: ClassRow; now: Date }) {
  const href = useEntityHref();
  const start = new Date(c.startsAt);
  const cancelled = c.status === "cancelled";
  const booked = c.myBooking === "booked" && !cancelled;
  const past = start.getTime() <= now.getTime();

  return (
    <div
      className={cn(
        "relative flex flex-col px-4 py-4 transition-colors motion-reduce:transition-none lg:grid lg:grid-cols-[6.5rem_minmax(0,1fr)_auto] lg:items-center lg:gap-x-6 lg:px-5",
        booked ? "bg-raised" : "hover:bg-hover",
        past && "opacity-60",
      )}
    >
      {booked && <span aria-hidden className={LIT_BAR} />}
      <div className="flex items-center justify-between gap-3 lg:self-start">
        <span className="flex items-baseline gap-2 lg:flex-col lg:gap-0.5">
          <span className="text-md font-medium tabular-nums">
            {timeFmt.format(start)}
          </span>
          <span className="text-muted-foreground text-xs tabular-nums">
            {c.durationMinutes} min
          </span>
        </span>
        {booked && (
          <Badge className="lg:hidden">
            <Check aria-hidden />
            Booked
          </Badge>
        )}
      </div>
      <div className="flex min-w-0 flex-col">
        <div className="mt-1 flex items-center gap-3 lg:mt-0">
          <Link
            href={href(`/class/${c.id}`)}
            className={cn(
              "text-md rounded-sm font-semibold break-words after:absolute after:inset-0 hover:underline",
              FOCUS_RING,
              cancelled && "text-muted-foreground line-through",
            )}
          >
            {c.title}
          </Link>
          {booked && (
            <Badge className="hidden lg:inline-flex">
              <Check aria-hidden />
              Booked
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {c.discipline && <Discipline name={c.discipline} />}
          {c.instructorName && <span>{c.instructorName}</span>}
          {cancelled && (
            <span className="text-error-text font-medium">Cancelled</span>
          )}
        </p>
      </div>

      {!cancelled && (
        <div className="mt-4 flex flex-col gap-3 sm:max-w-sm lg:mt-0 lg:flex-row lg:items-center lg:gap-6">
          <div className="flex flex-col gap-1.5 lg:w-36">
            <span className="text-muted-foreground text-xs tabular-nums">
              {spotsLeftLabel(c.capacity, c.bookingCount)}
            </span>
            {c.capacity > 0 && (
              <Meter
                value={c.bookingCount}
                max={c.capacity}
                label={`${c.bookingCount} of ${c.capacity} spots taken`}
              />
            )}
          </div>
          {!past && (
            <div className="relative z-10 flex items-center gap-2">
              <BookControl
                c={c}
                className="flex-1 lg:w-36 lg:flex-none"
                {...props}
              />
              <ClassDropInLink
                cls={c}
                label={`Copy a link for a friend to join ${c.title}`}
                iconOnly
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
