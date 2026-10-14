"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import { canBook, capacityDisplay, notBookableMessage } from "@matops/domain";
import { cn } from "@matops/ui";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import { FOCUS_RING } from "@matops/ui/motion";

import { dayLongFmt, timeFmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { ClassDropInLink } from "./class-drop-in-link";
import { useEntity, useEntityHref, useOrganization } from "./entity";
import { PageHeader } from "./page-header";
import { cardClass, ENTER, SectionHeading } from "./primitives";
import { ScreenSkeleton, SkeletonCard } from "./skeletons";
import { EmptyState, ErrorState } from "./states";
import { useBooking } from "./use-booking";
import { useMinuteClock } from "./use-clock";

export function ClassDetail({ classId }: { classId: string }) {
  const href = useEntityHref();
  const academy = useEntity();
  const trpc = useTRPC();
  const { book, cancel, busy, locked, lockedMessage } = useBooking();
  const { canRunOrganization } = useOrganization();
  const searchParams = useSearchParams();
  const now = useMinuteClock();

  const cls = useQuery({
    ...trpc.class.get.queryOptions({ id: classId }),
    retry: false,
  });

  if (cls.isPending) return <ScreenSkeleton />;
  if (cls.isError) {
    return (
      <>
        <PageHeader title="Class" />
        <ErrorState label="this class" onRetry={() => void cls.refetch()} />
        <Button asChild size="sm" variant="outline" className="mt-4">
          <Link href={href("/")}>Back to schedule</Link>
        </Button>
      </>
    );
  }

  const c = cls.data;
  const start = new Date(c.startsAt);
  const cancelled = c.status === "cancelled";
  const booked = c.myBooking === "booked";
  const provisional = booked && c.myBookingTier === "provisional";
  const past = start.getTime() <= now.getTime();
  const bookable = canBook(
    { status: c.status, startsAt: start, deletedAt: null },
    now,
    {
      bookingWindowDays: academy.bookingWindowDays,
      timeZone: academy.timeZone ?? "UTC",
    },
  );
  const refusal =
    bookable.reason && bookable.reason !== "deleted"
      ? notBookableMessage(bookable.reason, academy.bookingWindowDays)
      : null;
  const cap = capacityDisplay(c.bookingCount, c.capacity);

  return (
    <>
      <Link
        href={href("/")}
        className={cn(
          "text-muted-foreground hover:text-foreground mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-sm text-sm transition-colors motion-reduce:transition-none",
          FOCUS_RING,
        )}
      >
        <ArrowLeft aria-hidden className="size-3.5" />
        Back to schedule
      </Link>
      <PageHeader
        title={c.title}
        subtitle={`${dayLongFmt.format(start)} · ${timeFmt.format(start)}`}
      />
      <div className="flex flex-col gap-8">
        {canRunOrganization && searchParams.get("accessPerson") && (
          <section
            className={cn(cardClass(), "border-warning/40", ENTER, "space-y-2")}
          >
            <h2 className="text-lg font-semibold">Access needs action</h2>
            <p className="text-sm">
              {searchParams.get("accessPerson")}:{" "}
              {searchParams.get("accessReason") === "payment-declined"
                ? "Their payment was declined. Confirm it from Needs action to restore access."
                : searchParams.get("accessReason") === "suspended"
                  ? "Access is paused. Restore it from the person profile."
                  : searchParams.get("accessReason") === "membership-inactive"
                    ? "Their membership is paused or ended. Restore it from the person profile."
                    : "No active membership covers this branch. Give them a covering membership from the person profile."}
            </p>
          </section>
        )}
        {!canRunOrganization && (
          <section className={cn(cardClass(), ENTER, "space-y-4")}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold">
                  {cancelled
                    ? "Class cancelled"
                    : past
                      ? "Booking closed"
                      : booked
                        ? provisional
                          ? "Waiting for approval"
                          : "You're booked"
                        : "Book your place"}
                </h2>
                <p className="text-muted-foreground text-sm">
                  {cancelled
                    ? "This class will not take place. Choose another session from the schedule."
                    : past
                      ? `${refusal ?? "This class has started"}.`
                      : provisional
                        ? "Your booking is saved. Your gym still needs to approve it."
                        : booked
                          ? "Cancel your booking if your plans change."
                          : cap.isOver
                            ? "This class looks full. Your gym still allows bookings."
                            : `${cap.label} · ${c.durationMinutes} min`}
                </p>
              </div>
              {!cancelled &&
                !past &&
                (booked ? (
                  <Button
                    variant="outline"
                    busy={busy}
                    disabled={busy}
                    onClick={() => cancel.mutate({ classId })}
                  >
                    Cancel booking
                  </Button>
                ) : cap.isOver ? (
                  <ConfirmDialog
                    title="This class looks full"
                    description="Your gym decides the real limit, so you can still book. Ask them if you are not sure."
                    confirmLabel="Book anyway"
                    variant="primary"
                    onConfirm={() => book.mutate({ classId })}
                    trigger={
                      <Button
                        variant="secondary"
                        busy={busy}
                        disabled={busy || locked || !bookable.ok}
                      >
                        Book class
                      </Button>
                    }
                  />
                ) : (
                  <Button
                    busy={busy}
                    disabled={busy || locked || !bookable.ok}
                    onClick={() => book.mutate({ classId })}
                  >
                    Book class
                  </Button>
                ))}
            </div>
            <ClassDropInLink cls={c} label="Copy link for a friend" />
            {!cancelled && !past && !booked && lockedMessage && (
              <p role="status" className="border-border border-t pt-4 text-sm">
                {lockedMessage}
              </p>
            )}
          </section>
        )}

        <section className={cn(ENTER, "space-y-4 delay-100")}>
          <SectionHeading>Class details</SectionHeading>
          <dl className={cn(cardClass(), "grid gap-4 sm:grid-cols-2")}>
            <Detail
              term="Time"
              value={`${timeFmt.format(start)} · ${c.durationMinutes} min`}
            />
            <Detail term="Discipline" value={c.discipline ?? "Not specified"} />
            <Detail
              term="Instructor"
              value={c.instructorName ?? "Not assigned yet"}
            />
            <Detail
              term="Availability"
              value={cap.label}
              note={
                cap.isOver && bookable.ok ? "Bookings still allowed" : undefined
              }
              alert={cap.isOver}
            />
            {c.description && (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground text-sm">
                  About this class
                </dt>
                <dd className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">
                  {c.description}
                </dd>
              </div>
            )}
          </dl>
        </section>

        <section className={cn(ENTER, "space-y-4 delay-200")}>
          <SectionHeading>Who's booked</SectionHeading>
          <Attendees classId={classId} booked={booked && !cancelled} />
        </section>
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
      <dt className="text-muted-foreground text-sm">{term}</dt>
      <dd className="mt-1 text-sm leading-relaxed whitespace-pre-wrap">
        {value}
        {note && (
          <span
            className={cn(
              "ml-2 text-xs font-normal",
              alert ? "text-error-text" : "text-muted-foreground",
            )}
          >
            {note}
          </span>
        )}
      </dd>
    </div>
  );
}

function Attendees({ classId, booked }: { classId: string; booked: boolean }) {
  const trpc = useTRPC();
  const view = useQuery(trpc.class.attendees.queryOptions({ id: classId }));

  if (view.isPending) return <SkeletonCard lines={2} />;
  if (view.isError) {
    return <ErrorState label="who's in" onRetry={() => void view.refetch()} />;
  }

  const { names, othersCount, namesHidden } = view.data;
  if (names.length === 0 && othersCount === 0) {
    return (
      <EmptyState title={booked ? "Just you so far" : "No bookings yet"} />
    );
  }

  return (
    <div className={cardClass()}>
      {names.length > 0 && <p className="text-sm">{names.join(", ")}</p>}
      {othersCount > 0 && (
        <p className="text-muted-foreground mt-1 text-sm">
          {names.length > 0
            ? `+${othersCount} ${othersCount === 1 ? "other" : "others"}`
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
