"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import type { RouterOutputs } from "@matops/api";
import {
  calendarWeekStart,
  capacityDisplay,
  GRID_WEEK_STARTS_ON,
  groupByDay,
  scheduleWeekWindow,
} from "@matops/domain";
import { cn } from "@matops/ui";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Badge } from "@matops/ui/badge";
import { Button } from "@matops/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@matops/ui/dialog";
import { FieldError } from "@matops/ui/field";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { FOCUS_RING, FOCUS_RING_INSET } from "@matops/ui/motion";
import { Select } from "@matops/ui/select";
import { toast } from "@matops/ui/toast";

import {
  clockParts,
  dayKey,
  dayNumFmt,
  dayShortFmt,
  monthDayFmt,
  timeFmt,
} from "~/lib/format";
import { optimistic, rollback } from "~/lib/optimistic";
import { useTRPC } from "~/trpc/react";
import { ClassRoster, ROSTER_DIALOG } from "./class-roster";
import { InstructorOptions } from "./coach-select";
import { useEntity } from "./entity";
import { disciplineDot, LIST, RESOLVE, Section } from "./primitives";
import { SchedulePoster } from "./schedule-poster";
import { SkeletonRows } from "./skeletons";
import { EmptyState, ErrorState } from "./states";
import { useDisciplineHue } from "./use-discipline-hue";
import { WeekGrid } from "./week-grid";

type ClassRow = RouterOutputs["class"]["week"][number];

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
  discipline: string;
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
export function Schedule({
  onOpenTemplate,
}: {
  onOpenTemplate?: (templateId: string) => void;
} = {}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [offset, setOffset] = useState(0);
  const [form, setForm] = useState<OneOffForm | null>(null);
  const [titleError, setTitleError] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const weekWindow = useMemo(
    () => scheduleWeekWindow(new Date(), offset),
    [offset],
  );
  const week = useQuery(
    trpc.class.week.queryOptions(weekWindow, {
      placeholderData: keepPreviousData,
    }),
  );
  const stale = week.isPlaceholderData;
  const templates = useQuery(trpc.template.list.queryOptions());
  const disciplines = useQuery(trpc.discipline.list.queryOptions());
  const { hueOf } = useDisciplineHue();
  const me = useEntity();
  const unavailableDiscipline =
    form !== null &&
    form.discipline !== "" &&
    disciplines.isSuccess &&
    !disciplines.data.some((discipline) => discipline.name === form.discipline);
  const invalidate = () =>
    queryClient.invalidateQueries(trpc.class.week.pathFilter());
  const onError = (err: { message: string }) =>
    toast.error(
      err.message ||
        "Couldn't finish that. Check your connection and try again.",
    );

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
  const cancel = useMutation(
    trpc.class.cancel.mutationOptions({
      onMutate: (vars) =>
        optimistic(queryClient, trpc.class.week.queryKey(weekWindow), (old) =>
          old.map((c) =>
            c.id === vars.id ? { ...c, status: "cancelled" as const } : c,
          ),
        ),
      onError: (err, _vars, ctx) => {
        rollback(queryClient, ctx);
        onError(err);
      },
      onSuccess: (result) => {
        const sent = result.notice.delivery.accepted;
        const pending = result.notice.delivery.remaining;
        const failed =
          result.notice.delivery.failed + result.notice.delivery.unknown;
        toast.success(
          `Class cancelled. Email: ${sent} accepted, ${pending} remaining, ${failed} need attention.`,
        );
      },
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
    if (disciplines.isPending || disciplines.isError) return;
    if (unavailableDiscipline) {
      document.getElementById("cl-discipline")?.focus();
      return;
    }
    if (form.title.trim().length < 1) {
      setTitleError(true);
      document.getElementById("cl-title")?.focus();
      return;
    }
    setTitleError(false);
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
  const rangeLabel = `${monthDayFmt.format(start)} - ${
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
  const detailTemplate = templates.data?.find(
    (t) => t.id === detail?.templateId,
  );

  const detailDialog = (
    <Dialog
      open={detail !== undefined}
      onOpenChange={(next) => !next && setDetailId(null)}
    >
      <DialogContent {...ROSTER_DIALOG}>
        {detail && (
          <>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pr-10">
                <DialogTitle className="pr-0">{detail.title}</DialogTitle>
                {detail.discipline && (
                  <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                    <span
                      aria-hidden
                      className={cn(
                        "size-2 rounded-full",
                        disciplineDot(hueOf(detail.discipline)),
                      )}
                    />
                    {detail.discipline}
                  </span>
                )}
                {detail.status === "cancelled" && (
                  <Badge tone="error">cancelled</Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <DialogDescription className="tabular-nums">
                  {dayShortFmt.format(new Date(detail.startsAt))},{" "}
                  {timeFmt.format(new Date(detail.startsAt))} for{" "}
                  {detail.durationMinutes} min
                </DialogDescription>
                {detailTemplate && onOpenTemplate && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="-mr-2"
                    onClick={() => {
                      setDetailId(null);
                      onOpenTemplate(detailTemplate.id);
                    }}
                  >
                    {detailTemplate.title === detail.title
                      ? "Open template"
                      : `Open template: ${detailTemplate.title}`}
                  </Button>
                )}
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
              <ClassRoster
                key={detail.id}
                cls={detail}
                expectedRows={detail.bookingCount}
              />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );

  return (
    <section className="flex flex-col gap-4">
      {detailDialog}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Previous week"
            onClick={() => setOffset(offset - 1)}
          >
            <ChevronLeft aria-hidden />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            title="Back to this week"
            className={cn(
              "px-2 tabular-nums",
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
            <ChevronRight aria-hidden />
          </Button>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SchedulePoster />
          <Button
            size="sm"
            variant="outline"
            onClick={() => setForm(emptyOneOff(me.userId))}
          >
            Add class
          </Button>
        </div>
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
                  onChange={(e) => {
                    setForm({ ...form, title: e.target.value });
                    setTitleError(false);
                  }}
                  placeholder="Open mat"
                  maxLength={80}
                  required
                  aria-invalid={titleError ? true : undefined}
                  aria-describedby={titleError ? "cl-title-error" : undefined}
                />
                {titleError && (
                  <FieldError id="cl-title-error">
                    Give the class a title.
                  </FieldError>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
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
                    disabled={disciplines.isPending || disciplines.isError}
                    aria-invalid={unavailableDiscipline}
                    aria-describedby={
                      unavailableDiscipline
                        ? "cl-discipline-unavailable"
                        : undefined
                    }
                    onChange={(e) =>
                      setForm({
                        ...form,
                        discipline: e.target.value,
                      })
                    }
                  >
                    <option value="">None</option>
                    {unavailableDiscipline && (
                      <option value={form.discipline} disabled>
                        {form.discipline} (no longer available)
                      </option>
                    )}
                    {disciplines.data?.map((discipline) => (
                      <option key={discipline.id} value={discipline.name}>
                        {discipline.name}
                      </option>
                    ))}
                  </Select>
                  {disciplines.isPending && (
                    <p role="status" className="text-muted-foreground text-xs">
                      Loading disciplines…
                    </p>
                  )}
                  {disciplines.isError && (
                    <p className="text-error-text text-xs">
                      Couldn&apos;t load disciplines.{" "}
                      <button
                        type="button"
                        className="underline"
                        onClick={() => void disciplines.refetch()}
                      >
                        Try again
                      </button>
                    </p>
                  )}
                  {unavailableDiscipline && (
                    <FieldError id="cl-discipline-unavailable">
                      This discipline is no longer available. Choose another or
                      None.
                    </FieldError>
                  )}
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
                <Button
                  type="submit"
                  busy={create.isPending}
                  disabled={disciplines.isPending || disciplines.isError}
                >
                  Add class
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
        <SkeletonRows />
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
        <div
          className={cn(
            "flex flex-col gap-6 transition-opacity duration-200 motion-reduce:transition-none",
            RESOLVE,
            stale && "opacity-60",
          )}
        >
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
                  className={cn(
                    "border-border bg-card text-muted-foreground hover:text-error-text hover:border-error/50 flex size-5 items-center justify-center rounded-sm border transition-colors motion-reduce:transition-none",
                    FOCUS_RING,
                  )}
                  disabled={cancel.isPending && cancel.variables.id === c.id}
                >
                  <X aria-hidden className="size-3" />
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
                <ul className={LIST}>
                  {rows.map((c) => {
                    const cancelled = c.status === "cancelled";
                    const full = capacityDisplay(
                      c.bookingCount,
                      c.capacity,
                    ).isOver;
                    const hue = hueOf(c.discipline);
                    const { clock, period } = clockParts(new Date(c.startsAt));
                    return (
                      <li
                        key={c.id}
                        className={cn(
                          "flex items-stretch gap-2 pr-1",
                          cancelled && "bg-background",
                        )}
                      >
                        <span
                          aria-hidden
                          className={cn(
                            "w-[3px] shrink-0",
                            cancelled ? "bg-error/40" : disciplineDot(hue),
                          )}
                        />
                        <button
                          type="button"
                          className={cn(
                            "hover:bg-hover flex min-w-0 flex-1 items-start gap-3 py-3 pl-1.5 text-left transition-colors motion-reduce:transition-none",
                            FOCUS_RING_INSET,
                          )}
                          onClick={() => setDetailId(c.id)}
                        >
                          <span className="w-11 shrink-0 text-right">
                            <span
                              className={cn(
                                "block text-sm leading-5 tabular-nums",
                                cancelled &&
                                  "text-muted-foreground line-through",
                              )}
                            >
                              {clock}
                            </span>
                            {period && (
                              <span className="text-muted-foreground text-2xs block leading-none">
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
                            <span className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 text-xs">
                              {cancelled && (
                                <span className="text-error-text">
                                  cancelled
                                </span>
                              )}
                              {c.discipline && <span>{c.discipline}</span>}
                              <span>
                                {c.bookingCount}/{c.capacity} booked
                              </span>
                              {full && (
                                <span className="text-warning">busy</span>
                              )}
                              {c.pendingCount > 0 && (
                                <span className="text-foreground">
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
                              className="text-muted-foreground hover:text-error-text shrink-0 self-center"
                              disabled={
                                cancel.isPending && cancel.variables.id === c.id
                              }
                            >
                              <X aria-hidden />
                            </Button>,
                          )}
                      </li>
                    );
                  })}
                </ul>
              </Section>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
