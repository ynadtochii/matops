"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import type { DisciplineTone } from "@matops/domain";
import {
  calendarWeekStart,
  capacityDisplay,
  disciplineTone,
  GRID_WEEK_STARTS_ON,
  groupByDay,
  scheduleWeekWindow,
} from "@matops/domain";
import { cn } from "@matops/ui";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@matops/ui/dialog";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Select } from "@matops/ui/select";
import { Spinner } from "@matops/ui/spinner";
import { toast } from "@matops/ui/toast";

import {
  clockParts,
  dayKey,
  dayNumFmt,
  dayShortFmt,
  monthDayFmt,
  timeFmt,
} from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { useAcademy } from "./academy";
import { ClassRoster } from "./class-roster";
import { InstructorOptions } from "./coach-select";
import { Section } from "./primitives";
import { SkeletonScheduleWeek } from "./skeletons";
import { EmptyState, ErrorState } from "./states";
import { WeekGrid } from "./week-grid";

type ClassRow = RouterOutputs["class"]["week"][number];

const DISCIPLINES = ["bjj", "nogi", "judo", "mma", "other"] as const;
type Discipline = (typeof DISCIPLINES)[number];

/** The mobile list's discipline rail. The desktop grid paints its own map. */
const TONE_RAIL: Record<DisciplineTone, string> = {
  gi: "bg-gi",
  nogi: "bg-nogi",
  other: "bg-border",
};

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

const XMark = () => (
  <svg
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    className="size-4"
    aria-hidden
  >
    <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
  </svg>
);

const browserTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
};

const weekStart = (offset: number) =>
  calendarWeekStart(new Date(), offset, GRID_WEEK_STARTS_ON);

interface OneOffForm {
  title: string;
  instructorId: string;
  discipline: Discipline | "";
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  durationMinutes: number;
  capacity: number;
  timeZone: string;
}

const emptyOneOff = (instructorId: string): OneOffForm => ({
  title: "",
  instructorId,
  discipline: "",
  date: dayKey(new Date()),
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
  const [detailId, setDetailId] = useState<string | null>(null);

  const weekWindow = useMemo(
    () => scheduleWeekWindow(new Date(), offset),
    [offset],
  );
  const week = useQuery(trpc.class.week.queryOptions(weekWindow));
  const me = useAcademy();
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
        const key = trpc.class.week.queryKey(weekWindow);
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

  // The window is snapped to a UTC Monday so the server and the browser build
  // the same cache key. Filtering here is what keeps the grid to its own week.
  const rows = useMemo(() => {
    const start = weekStart(offset).getTime();
    const end = start + 7 * 86400000;
    return (week.data ?? []).filter((r) => {
      const t = new Date(r.startsAt).getTime();
      return t >= start && t < end;
    });
  }, [week.data, offset]);

  const byDay = useMemo(() => groupByDay(rows), [rows]);

  const submitOneOff = () => {
    if (!form) return;
    if (form.title.trim().length < 1) {
      toast.error("Add a title");
      return;
    }
    create.mutate({
      title: form.title.trim(),
      instructorId: form.instructorId || undefined,
      discipline: form.discipline === "" ? null : form.discipline,
      date: form.date,
      startsAtMinutes: timeToMinutes(form.time),
      durationMinutes: form.durationMinutes,
      capacity: form.capacity,
      timeZone: form.timeZone,
    });
  };

  const start = weekStart(offset);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const rangeLabel = `${monthDayFmt.format(start)} – ${
    start.getMonth() === end.getMonth()
      ? dayNumFmt.format(end)
      : monthDayFmt.format(end)
  }`;

  const cancelDialog = (c: ClassRow, trigger: ReactNode) => (
    <ConfirmDialog
      title="Cancel this class?"
      description={`${c.title} on ${dayShortFmt.format(new Date(c.startsAt))} at ${timeFmt.format(new Date(c.startsAt))}. Everyone booked in loses their spot. This can't be undone.`}
      confirmLabel="Cancel class"
      cancelLabel="Keep class"
      variant="destructive"
      onConfirm={async () => {
        await cancel.mutateAsync({ id: c.id });
      }}
      trigger={trigger}
    />
  );

  const detail = (week.data ?? []).find((c) => c.id === detailId);

  const detailDialog = (
    <Dialog
      open={detail !== undefined}
      onOpenChange={(next) => !next && setDetailId(null)}
    >
      <DialogContent>
        {detail && (
          <>
            <DialogTitle>{detail.title}</DialogTitle>
            <DialogDescription>
              {dayShortFmt.format(new Date(detail.startsAt))} ·{" "}
              {timeFmt.format(new Date(detail.startsAt))} ·{" "}
              {detail.durationMinutes} min
              {detail.discipline && ` · ${detail.discipline.toUpperCase()}`}
              {detail.status === "cancelled" && " · cancelled"}
            </DialogDescription>
            <ClassRoster key={detail.id} cls={detail} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );

  return (
    <section className="flex flex-col gap-4">
      {detailDialog}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Previous week"
            onClick={() => setOffset(offset - 1)}
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            title="Back to this week"
            className={cn(
              "px-2 font-mono text-xs tracking-wide uppercase tabular-nums",
              offset === 0 ? "text-foreground" : "text-muted-foreground",
            )}
            onClick={() => setOffset(0)}
          >
            {rangeLabel}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Next week"
            onClick={() => setOffset(offset + 1)}
          >
            <ChevronRight />
          </Button>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={() => setForm(emptyOneOff(me.userId))}
        >
          Add class
        </Button>
      </div>

      <Dialog
        open={form !== null}
        onOpenChange={(next) => !next && setForm(null)}
      >
        <DialogContent>
          {form !== null && (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                submitOneOff();
              }}
            >
              <DialogTitle>One-off class</DialogTitle>
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
                      setForm({
                        ...form,
                        durationMinutes: e.target.valueAsNumber,
                      })
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
                  <Label htmlFor="cl-instructor">Coach</Label>
                  <Select
                    id="cl-instructor"
                    value={form.instructorId}
                    onChange={(e) =>
                      setForm({ ...form, instructorId: e.target.value })
                    }
                  >
                    <InstructorOptions
                      value={form.instructorId}
                      fallbackLabel="You"
                    />
                  </Select>
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
                  onChange={(e) =>
                    setForm({ ...form, timeZone: e.target.value })
                  }
                  required
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending && (
                    <Spinner size="sm" className="text-current" />
                  )}
                  {create.isPending ? "Adding…" : "Add class"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setForm(null)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {week.isPending ? (
        <SkeletonScheduleWeek />
      ) : week.isError ? (
        <ErrorState
          label="this week's schedule"
          onRetry={() => void week.refetch()}
        />
      ) : byDay.length === 0 ? (
        <EmptyState title="No classes this week.">
          Add a one-off class above, or set up a recurring template below.
        </EmptyState>
      ) : (
        <>
          <WeekGrid
            rows={rows}
            weekStart={weekStart(offset)}
            onSelect={(c) => setDetailId(c.id)}
            action={(c) =>
              cancelDialog(
                c,
                <button
                  type="button"
                  aria-label={`Cancel ${c.title}`}
                  title="Cancel class"
                  className="border-border bg-card text-muted-foreground hover:text-error hover:border-error/50 flex size-5 items-center justify-center rounded-[3px] border text-[11px] leading-none"
                  disabled={cancel.isPending && cancel.variables.id === c.id}
                >
                  ×
                </button>,
              )
            }
          />
          <div className="flex flex-col gap-6 md:hidden">
            {byDay.map(([key, rows]) => (
              <Section
                key={key}
                label={dayShortFmt.format(new Date(`${key}T12:00:00`))}
                meta={
                  (key === dayKey(new Date()) ? "today · " : "") +
                  `${rows.length} ${rows.length === 1 ? "class" : "classes"}`
                }
              >
                <ul className="flex flex-col gap-2">
                  {rows.map((c) => {
                    const cancelled = c.status === "cancelled";
                    const full = capacityDisplay(
                      c.bookingCount,
                      c.capacity,
                    ).isOver;
                    const tone = disciplineTone(c.discipline);
                    const { clock, period } = clockParts(new Date(c.startsAt));
                    return (
                      <li
                        key={c.id}
                        className={cn(
                          "border-border flex items-stretch gap-2 overflow-hidden rounded-lg border pr-1",
                          cancelled ? "border-dashed" : "bg-card",
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "w-[3px] shrink-0",
                            cancelled ? "bg-error/40" : TONE_RAIL[tone],
                          )}
                        />
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-start gap-3 py-3 pl-1.5 text-left"
                          onClick={() => setDetailId(c.id)}
                        >
                          <span className="w-11 shrink-0 text-right">
                            <span
                              className={cn(
                                "block font-mono text-sm leading-5 tabular-nums",
                                cancelled &&
                                  "text-muted-foreground line-through",
                              )}
                            >
                              {clock}
                            </span>
                            {period && (
                              <span className="text-muted-foreground block font-mono text-[10px] leading-none">
                                {period}
                              </span>
                            )}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span
                              className={cn(
                                "block truncate text-sm leading-5 font-medium",
                                cancelled && "text-muted-foreground",
                              )}
                            >
                              {c.title}
                            </span>
                            <span className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 font-mono text-[10px] tracking-wide uppercase">
                              {cancelled && (
                                <span className="text-error">cancelled</span>
                              )}
                              {c.discipline && <span>{c.discipline}</span>}
                              <span>
                                {c.bookingCount}/{c.capacity} booked
                              </span>
                              {full && (
                                <span className="text-warning">busy</span>
                              )}
                              {c.pendingCount > 0 && (
                                <span className="text-brand-strong">
                                  +{c.pendingCount} pending
                                </span>
                              )}
                              <span>{c.durationMinutes} min</span>
                            </span>
                          </span>
                        </button>
                        {!cancelled &&
                          cancelDialog(
                            c,
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`Cancel ${c.title}`}
                              className="text-muted-foreground hover:text-error shrink-0 self-center"
                              disabled={
                                cancel.isPending && cancel.variables.id === c.id
                              }
                            >
                              <XMark />
                            </Button>,
                          )}
                      </li>
                    );
                  })}
                </ul>
              </Section>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
