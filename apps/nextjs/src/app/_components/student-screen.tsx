"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import { capacityDisplay, spotsLeftLabel, timeFmt } from "@matops/domain";
import { cn } from "@matops/ui";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import { Spinner } from "@matops/ui/spinner";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";
import { InstallAppCard } from "./install-app-card";
import { PageHeader } from "./page-header";
import { cardClass, Eyebrow } from "./primitives";
import { EmptyState, ErrorState, SkeletonRows } from "./states";

type ClassRow = RouterOutputs["class"]["mine"][number];

const dayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "short",
  day: "numeric",
});
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function StudentScreen({
  academyName,
  status,
}: {
  academyName: string;
  status: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const suspended = status === "suspended";

  const { from, to, todayKey } = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return {
      from: start.toISOString(),
      to: end.toISOString(),
      todayKey: dayKeyFmt.format(start),
    };
  }, []);

  const week = useQuery(
    trpc.class.mine.queryOptions({ from, to }, { enabled: !suspended }),
  );

  const now = new Date();

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.class.pathFilter());
  const onError = (err: { message: string }) =>
    toast.error(err.message || "Could not update your booking");

  const book = useMutation(
    trpc.booking.book.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Booked");
      },
      onError,
    }),
  );
  const cancel = useMutation(
    trpc.booking.cancel.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Booking cancelled");
      },
      onError,
    }),
  );

  const byDay = useMemo(() => {
    const groups = new Map<string, ClassRow[]>();
    for (const c of week.data ?? []) {
      const key = dayKeyFmt.format(new Date(c.startsAt));
      const list = groups.get(key) ?? [];
      list.push(c);
      groups.set(key, list);
    }
    return [...groups.entries()];
  }, [week.data]);

  if (suspended) {
    return (
      <>
        <PageHeader title={academyName} />
        <EmptyState title="Your membership is paused.">
          Contact your gym to restore your access.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={academyName}
        subtitle="Your classes for the next seven days."
      />
      {week.isPending ? (
        <SkeletonRows rows={5} />
      ) : week.isError ? (
        <ErrorState label="your schedule" onRetry={() => void week.refetch()} />
      ) : byDay.length === 0 ? (
        <EmptyState title="No classes this week.">
          Check back soon — your gym adds classes here as they schedule them.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-8">
          {byDay.map(([key, rows]) => (
            <section key={key} className="flex flex-col gap-2">
              <Eyebrow>
                {key === todayKey
                  ? "Today"
                  : dayFmt.format(new Date(`${key}T12:00:00`))}
              </Eyebrow>
              {rows.map((c) => (
                <ClassRowCard
                  key={c.id}
                  c={c}
                  now={now}
                  busy={
                    (book.isPending && book.variables.classId === c.id) ||
                    (cancel.isPending && cancel.variables.classId === c.id)
                  }
                  onBook={() => book.mutate({ classId: c.id })}
                  onCancel={() => cancel.mutate({ classId: c.id })}
                />
              ))}
            </section>
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
  onBook,
  onCancel,
}: {
  c: ClassRow;
  now: Date;
  busy: boolean;
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
        cardClass(),
        "flex flex-wrap items-center justify-between gap-3",
        cancelled && "opacity-60",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-semibold tabular-nums">
            {timeFmt.format(start)}
          </span>
          <span className="truncate font-medium">{c.title}</span>
        </p>
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {c.discipline && <Eyebrow>{c.discipline}</Eyebrow>}
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
        </p>
      </div>

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
            <Button variant="secondary" size="sm" disabled={busy}>
              {busy && <Spinner size="sm" className="text-current" />}
              Book
            </Button>
          }
        />
      ) : (
        <Button size="sm" disabled={busy} onClick={onBook}>
          {busy && <Spinner size="sm" className="text-current" />}
          Book
        </Button>
      )}
    </div>
  );
}
