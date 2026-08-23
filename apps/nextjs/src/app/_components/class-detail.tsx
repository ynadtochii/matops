"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { capacityDisplay } from "@matops/domain";
import { cn } from "@matops/ui";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import { Spinner } from "@matops/ui/spinner";

import { dayLongFmt, timeFmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { PageHeader } from "./page-header";
import { cardClass, Eyebrow, Section } from "./primitives";
import { ClassDetailSkeleton, SkeletonCard } from "./skeletons";
import { EmptyState, ErrorState } from "./states";
import { useBooking } from "./use-booking";

export function ClassDetail({ classId }: { classId: string }) {
  const trpc = useTRPC();
  const { book, cancel, busy } = useBooking();

  const cls = useQuery({
    ...trpc.class.get.queryOptions({ id: classId }),
    retry: false,
  });

  if (cls.isPending) return <ClassDetailSkeleton />;
  if (cls.isError) {
    return (
      <>
        <PageHeader title="Class" />
        <EmptyState
          title="We couldn't open that class."
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/">Back to the schedule</Link>
            </Button>
          }
        >
          It may have been removed, or it belongs to another gym.
        </EmptyState>
      </>
    );
  }

  const c = cls.data;
  const start = new Date(c.startsAt);
  const cancelled = c.status === "cancelled";
  const booked = c.myBooking === "booked";
  const provisional = booked && c.myBookingTier === "provisional";
  const past = start.getTime() <= new Date().getTime();
  const cap = capacityDisplay(c.bookingCount, c.capacity);

  return (
    <>
      <PageHeader
        title={c.title}
        subtitle={`${dayLongFmt.format(start)} · ${timeFmt.format(start)}`}
      />
      <div className="flex flex-col gap-8">
        {cancelled && (
          <div className="border-error/30 bg-error/5 rounded-lg border p-4 text-sm">
            This class was cancelled. Booking is closed.
          </div>
        )}

        <Section label="Details">
          <dl className={cn(cardClass(), "grid gap-4 sm:grid-cols-2")}>
            <Detail
              term="Time"
              value={`${timeFmt.format(start)} · ${c.durationMinutes} min`}
            />
            <Detail term="Discipline" value={c.discipline ?? "—"} />
            <Detail term="Instructor" value={c.instructorName ?? "—"} />
            <Detail
              term="Spots"
              value={cap.label}
              note={cap.isOver ? "may be busy" : undefined}
              alert={cap.isOver}
            />
          </dl>
        </Section>

        <Section label="Who's in">
          <Attendees classId={classId} />
        </Section>

        {!cancelled && past && (
          <p className="text-muted-foreground text-sm">
            This class has already started.
          </p>
        )}

        {!cancelled && !past && (
          <div className="flex flex-wrap items-center gap-3">
            {booked ? (
              <>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => cancel.mutate({ classId })}
                >
                  {busy && <Spinner size="sm" className="text-current" />}
                  Cancel booking
                </Button>
                <span className="text-muted-foreground text-sm">
                  {provisional ? "Booked · pending approval" : "You're booked"}
                </span>
              </>
            ) : cap.isOver ? (
              <ConfirmDialog
                title="This class looks full"
                description="Your gym manages the room, so you can still book it."
                confirmLabel="Book anyway"
                variant="primary"
                onConfirm={() => book.mutate({ classId })}
                trigger={
                  <Button variant="secondary" disabled={busy}>
                    {busy && <Spinner size="sm" className="text-current" />}
                    Book
                  </Button>
                }
              />
            ) : (
              <Button disabled={busy} onClick={() => book.mutate({ classId })}>
                {busy && <Spinner size="sm" className="text-current" />}
                Book
              </Button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function Detail({
  term,
  value,
  note,
  alert,
}: {
  term: string;
  value: string;
  note?: string;
  alert?: boolean;
}) {
  return (
    <div>
      <Eyebrow>{term}</Eyebrow>
      <dd className="mt-0.5 text-sm font-medium capitalize">
        {value}
        {note && (
          <span
            className={cn(
              "ml-2 font-mono text-xs font-normal",
              alert ? "text-error" : "text-muted-foreground",
            )}
          >
            {note}
          </span>
        )}
      </dd>
    </div>
  );
}

function Attendees({ classId }: { classId: string }) {
  const trpc = useTRPC();
  const view = useQuery(trpc.class.attendees.queryOptions({ id: classId }));

  if (view.isPending) return <SkeletonCard lines={2} />;
  if (view.isError) {
    return <ErrorState label="who's in" onRetry={() => void view.refetch()} />;
  }

  const { names, othersCount, namesHidden } = view.data;
  if (names.length === 0 && othersCount === 0) {
    return <EmptyState title="Just you so far." />;
  }

  return (
    <div className={cardClass()}>
      {names.length > 0 && <p className="text-sm">{names.join(", ")}</p>}
      {othersCount > 0 && (
        <p className="text-muted-foreground mt-1 text-sm">
          {names.length > 0
            ? `+${othersCount} others`
            : `${othersCount} booked`}
        </p>
      )}
      {namesHidden && (
        <p className="text-muted-foreground mt-1 text-sm">
          Names show once your gym approves you.
        </p>
      )}
    </div>
  );
}
