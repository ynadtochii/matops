"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import { cn } from "@matops/ui";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Select } from "@matops/ui/select";
import { Spinner } from "@matops/ui/spinner";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";
import { cardClass } from "./primitives";
import { EmptyState, ErrorState, SkeletonRows } from "./states";

type ClassRow = RouterOutputs["class"]["week"][number];

const DISCIPLINES = ["bjj", "nogi", "judo", "mma", "other"] as const;
type Discipline = (typeof DISCIPLINES)[number];

const ChevronLeft = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-4"
    aria-hidden
  >
    <path d="M10 3.5L5.5 8l4.5 4.5" />
  </svg>
);
const ChevronRight = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-4"
    aria-hidden
  >
    <path d="M6 3.5L10.5 8 6 12.5" />
  </svg>
);

const browserTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
};

/** Monday 00:00 local for the week `offset` weeks from now. */
function weekStart(offset: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // 0=Mon … 6=Sun
  d.setDate(d.getDate() - day + offset * 7);
  return d;
}

const timeFmt = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});
const dayFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
});
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

interface OneOffForm {
  title: string;
  discipline: Discipline | "";
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  durationMinutes: number;
  capacity: number;
  timeZone: string;
}

const emptyOneOff = (): OneOffForm => ({
  title: "",
  discipline: "",
  date: dayKeyFmt.format(new Date()),
  time: "18:00",
  durationMinutes: 60,
  capacity: 20,
  timeZone: browserTz(),
});

const timeToMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/**
 * O2 schedule — the week calendar of concrete classes (spec O2, §4). Staff read
 * the week, cancel a class, and add a one-off. Times render in this browser's
 * zone. Recurring generation lives in the templates panel (O3).
 */
export function Schedule() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [form, setForm] = useState<OneOffForm | null>(null);

  const { from, to } = useMemo(() => {
    const start = weekStart(offset);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { from: start.toISOString(), to: end.toISOString() };
  }, [offset]);

  const week = useQuery(trpc.class.week.queryOptions({ from, to }));
  const invalidate = () =>
    queryClient.invalidateQueries(trpc.class.week.pathFilter());
  const onError = (err: { message: string }) =>
    toast.error(err.message || "Action failed");

  const create = useMutation(
    trpc.class.create.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Class added");
        setForm(null);
      },
      onError,
    }),
  );
  // Optimistic cancel: flip the class to cancelled in the visible week straight
  // away (it re-renders read-only), reconcile on settle, roll back on error.
  const cancel = useMutation(
    trpc.class.cancel.mutationOptions({
      onMutate: async (vars) => {
        const key = trpc.class.week.queryKey({ from, to });
        await queryClient.cancelQueries({ queryKey: key });
        const prev = queryClient.getQueryData(key);
        queryClient.setQueryData(key, (old) =>
          old?.map((c) =>
            c.id === vars.id ? { ...c, status: "cancelled" as const } : c,
          ),
        );
        return { key, prev };
      },
      onError: (err, _vars, ctx) => {
        if (ctx) queryClient.setQueryData(ctx.key, ctx.prev);
        onError(err);
      },
      onSuccess: () => toast.success("Class cancelled"),
      onSettled: () => invalidate(),
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

  const submitOneOff = () => {
    if (!form) return;
    if (form.title.trim().length < 1) {
      toast.error("Add a title");
      return;
    }
    create.mutate({
      title: form.title.trim(),
      discipline: form.discipline === "" ? null : form.discipline,
      date: form.date,
      startsAtMinutes: timeToMinutes(form.time),
      durationMinutes: form.durationMinutes,
      capacity: form.capacity,
      timeZone: form.timeZone,
    });
  };

  const rangeLabel = `${dayFmt.format(weekStart(offset))} – ${dayFmt.format(
    new Date(weekStart(offset).getTime() + 6 * 86400000),
  )}`;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Previous week"
            onClick={() => setOffset(offset - 1)}
          >
            <ChevronLeft />
          </Button>
          <button
            type="button"
            title="Back to this week"
            className="text-muted-foreground hover:text-foreground rounded-md px-1 text-sm font-medium transition-colors"
            onClick={() => setOffset(0)}
          >
            {rangeLabel}
          </button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Next week"
            onClick={() => setOffset(offset + 1)}
          >
            <ChevronRight />
          </Button>
          {form === null && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setForm(emptyOneOff())}
            >
              Add class
            </Button>
          )}
        </div>
      </div>

      {week.isPending ? (
        <SkeletonRows rows={3} />
      ) : week.isError ? (
        <ErrorState label="this week's schedule" onRetry={() => void week.refetch()} />
      ) : byDay.length === 0 ? (
        <EmptyState title="No classes this week.">
          Add a one-off class above, or set up a recurring template below.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {byDay.map(([key, rows]) => (
            <div key={key} className="flex flex-col gap-2">
              <h3 className="text-muted-foreground text-xs font-semibold uppercase">
                {dayFmt.format(new Date(`${key}T12:00:00`))}
              </h3>
              {rows.map((c) => {
                const cancelled = c.status === "cancelled";
                const full = c.bookingCount >= c.capacity && c.capacity > 0;
                return (
                  <div
                    key={c.id}
                    className={cn(
                      cardClass(),
                      "flex flex-wrap items-center justify-between gap-3",
                      cancelled && "opacity-60",
                    )}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {timeFmt.format(new Date(c.startsAt))} · {c.title}
                        {c.discipline && (
                          <span className="text-muted-foreground ml-2 text-xs uppercase">
                            {c.discipline}
                          </span>
                        )}
                        {cancelled && (
                          <span className="text-destructive ml-2 text-xs uppercase">
                            cancelled
                          </span>
                        )}
                      </span>
                      <span
                        className={`text-sm ${full ? "text-warning" : "text-muted-foreground"}`}
                      >
                        {c.bookingCount}/{c.capacity}
                        {full ? " · may be busy" : " booked"}
                        {c.pendingCount > 0 &&
                          ` · +${c.pendingCount} pending`}{" "}
                        · {c.durationMinutes}
                        min
                      </span>
                    </div>
                    {!cancelled && (
                      <ConfirmDialog
                        title="Cancel this class?"
                        description={`${c.title} on ${dayFmt.format(new Date(c.startsAt))} at ${timeFmt.format(new Date(c.startsAt))}. Everyone booked in loses their spot. This can't be undone.`}
                        confirmLabel="Cancel class"
                        cancelLabel="Keep class"
                        variant="destructive"
                        onConfirm={async () => {
                          await cancel.mutateAsync({ id: c.id });
                        }}
                        trigger={
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive min-h-11 sm:min-h-8"
                            disabled={
                              cancel.isPending && cancel.variables.id === c.id
                            }
                          >
                            Cancel
                          </Button>
                        }
                      />
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {form !== null && (
        <form
          className={cn(cardClass(), "flex flex-col gap-4")}
          onSubmit={(e) => {
            e.preventDefault();
            submitOneOff();
          }}
        >
          <h3 className="font-medium">One-off class</h3>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cl-title">Title</Label>
            <Input
              id="cl-title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Open mat"
              maxLength={80}
              required
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cl-date">Date</Label>
              <Input
                id="cl-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cl-time">Start</Label>
              <Input
                id="cl-time"
                type="time"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cl-duration">Duration (min)</Label>
              <Input
                id="cl-duration"
                type="number"
                min={5}
                max={600}
                value={form.durationMinutes}
                onChange={(e) =>
                  setForm({ ...form, durationMinutes: e.target.valueAsNumber })
                }
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cl-capacity">Capacity</Label>
              <Input
                id="cl-capacity"
                type="number"
                min={0}
                max={1000}
                value={form.capacity}
                onChange={(e) =>
                  setForm({ ...form, capacity: e.target.valueAsNumber })
                }
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cl-discipline">Discipline</Label>
              <Select
                id="cl-discipline"
                value={form.discipline}
                onChange={(e) =>
                  setForm({
                    ...form,
                    discipline: e.target.value as Discipline | "",
                  })
                }
              >
                <option value="">None</option>
                {DISCIPLINES.map((d) => (
                  <option key={d} value={d}>
                    {d.toUpperCase()}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cl-tz">Time zone</Label>
            <Input
              id="cl-tz"
              value={form.timeZone}
              onChange={(e) => setForm({ ...form, timeZone: e.target.value })}
              required
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Spinner size="sm" className="text-current" />}
              {create.isPending ? "Adding…" : "Add class"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setForm(null)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
