"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import {
  DAY_LABELS,
  describeRecurrence,
  formatStartMinutes,
  isBjjAcademy,
  runsBranch,
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
import { FieldError } from "@matops/ui/field";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { FOCUS_RING } from "@matops/ui/motion";
import { Select } from "@matops/ui/select";
import { Spinner } from "@matops/ui/spinner";
import { Textarea } from "@matops/ui/textarea";
import { toast } from "@matops/ui/toast";

import { optimistic, rollback } from "~/lib/optimistic";
import { useTRPC } from "~/trpc/react";
import { InstructorOptions } from "./coach-select";
import { useEntity } from "./entity";
import { cardClass, RESOLVE, SectionHeading } from "./primitives";
import { SkeletonRows } from "./skeletons";
import { EmptyState, ErrorState } from "./states";

type Template = RouterOutputs["template"]["list"][number];

const DISCIPLINES = ["bjj", "nogi", "judo", "mma", "other"] as const;
type Discipline = (typeof DISCIPLINES)[number];

const browserTz = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
};

/** "HH:MM" (from <input type="time">) → minutes from midnight, and back. */
const timeToMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

interface FormState {
  title: string;
  instructorId: string;
  description: string;
  discipline: Discipline | "";
  curriculumTrackId: string;
  daysOfWeek: number[];
  time: string; // "HH:MM"
  durationMinutes: number;
  capacity: number;
  timeZone: string;
  publicBookable: boolean;
}

const emptyForm = (instructorId: string, timeZone: string): FormState => ({
  title: "",
  description: "",
  instructorId,
  discipline: "",
  curriculumTrackId: "",
  daysOfWeek: [],
  time: "18:00",
  durationMinutes: 60,
  capacity: 20,
  timeZone,
  publicBookable: false,
});

const formFromTemplate = (t: Template): FormState => ({
  title: t.title,
  description: t.description ?? "",
  instructorId: t.instructorId ?? "",
  discipline: t.discipline ?? "",
  curriculumTrackId: t.curriculumTrackId ?? "",
  daysOfWeek: t.daysOfWeek,
  time: formatStartMinutes(t.startsAtMinutes),
  durationMinutes: t.durationMinutes,
  capacity: t.capacity,
  timeZone: t.timeZone,
  publicBookable: t.publicBookable,
});

/**
 * Recurring class templates (spec O3). Staff define the weekly schedule here;
 * concrete classes are materialized from these (slice 2.2). A new template
 * takes the academy time zone (O6); an existing one keeps its own until someone
 * moves it on purpose (ADR 68).
 */
export function Templates({
  openTemplateId,
  onOpened,
}: {
  openTemplateId?: string | null;
  onOpened?: () => void;
} = {}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const list = useQuery(trpc.template.list.queryOptions());
  const me = useEntity();
  const bjj = isBjjAcademy(me.type);
  const board = useQuery(
    trpc.curriculum.board.queryOptions(
      {},
      { enabled: bjj && me.curriculumEnabled },
    ),
  );

  const [form, setForm] = useState<FormState | null>(null);
  const [daysError, setDaysError] = useState(false);
  const [titleError, setTitleError] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const academyTz = me.timeZone ?? browserTz();
  const owner = runsBranch(me);

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.template.list.pathFilter());
  const onError = (err: { message: string }) =>
    toast.error(
      err.message ||
        "Couldn't finish that. Check your connection and try again.",
    );

  const closeForm = () => {
    setForm(null);
    setDaysError(false);
    setEditingId(null);
    onOpened?.();
  };

  const create = useMutation(
    trpc.template.create.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Template created");
        closeForm();
      },
      onError,
    }),
  );
  const update = useMutation(
    trpc.template.update.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Template updated");
        closeForm();
      },
      onError,
    }),
  );
  const setStatus = useMutation(
    trpc.template.setStatus.mutationOptions({
      onMutate: (vars) =>
        optimistic(queryClient, trpc.template.list.queryKey(), (old) =>
          old.map((t) =>
            t.id === vars.id ? { ...t, status: vars.status } : t,
          ),
        ),
      onError: (err, _vars, ctx) => {
        rollback(queryClient, ctx);
        onError(err);
      },
      onSettled: () => invalidate(),
    }),
  );
  const remove = useMutation(
    trpc.template.delete.mutationOptions({ onSuccess: invalidate, onError }),
  );

  const busy = create.isPending || update.isPending;
  const templates = list.data ?? [];
  const openId = editingId ?? openTemplateId ?? null;
  const editingTemplate = list.data?.find((t) => t.id === openId);
  const shown =
    form ?? (editingTemplate ? formFromTemplate(editingTemplate) : null);
  const tracks = board.data?.tracks ?? [];
  const defaultTrack = tracks.find((t) => t.isDefault);

  const submit = () => {
    if (!shown) return;
    if (shown.title.trim().length < 1) {
      setTitleError(true);
      document.getElementById("tpl-title")?.focus();
      return;
    }
    setTitleError(false);
    if (shown.daysOfWeek.length === 0) {
      setDaysError(true);
      document.getElementById("tpl-day-0")?.focus();
      return;
    }
    const payload = {
      title: shown.title.trim(),
      description: shown.description,
      // A general space offers "Nobody" as a real choice, so an empty pick is
      // null and clears the coach. A BJJ form has no such option: empty there
      // means "leave it as it is", which the server reads from a missing field.
      instructorId: shown.instructorId || (bjj ? undefined : null),
      discipline: shown.discipline === "" ? null : shown.discipline,
      curriculumTrackId:
        shown.curriculumTrackId === "" ? null : shown.curriculumTrackId,
      daysOfWeek: shown.daysOfWeek,
      startsAtMinutes: timeToMinutes(shown.time),
      durationMinutes: shown.durationMinutes,
      capacity: shown.capacity,
      timeZone: shown.timeZone,
      publicBookable: shown.publicBookable,
    };
    if (openId) update.mutate({ id: openId, ...payload });
    else create.mutate(payload);
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Recurring classes</h2>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setEditingId(null);
            setForm(emptyForm(me.userId, academyTz));
          }}
        >
          New template
        </Button>
      </div>

      {list.isPending ? (
        <SkeletonRows rows={3} action />
      ) : list.isError ? (
        <ErrorState
          label="your templates"
          onRetry={() => void list.refetch()}
        />
      ) : templates.length === 0 ? (
        <EmptyState title="No recurring classes yet.">
          Create a weekly template and MatOps fills the calendar for you.
        </EmptyState>
      ) : (
        <div className={cn("flex flex-col gap-2", RESOLVE)}>
          {templates.map((t) => (
            <div
              key={t.id}
              className={cn(
                cardClass(),
                "flex flex-wrap items-center justify-between gap-3",
              )}
            >
              <div className="flex flex-col">
                <span className="font-medium">
                  {t.title}
                  {t.discipline && (
                    <span className="text-muted-foreground ml-2 text-xs uppercase">
                      {t.discipline}
                    </span>
                  )}
                  {t.status === "paused" && (
                    <span className="text-muted-foreground ml-2 text-xs uppercase">
                      paused
                    </span>
                  )}
                </span>
                <span className="text-muted-foreground text-sm">
                  {describeRecurrence(t.daysOfWeek, t.startsAtMinutes)} ·{" "}
                  {t.durationMinutes}min · cap {t.capacity}
                  {t.instructorName && ` · ${t.instructorName}`}
                </span>
                {t.description && (
                  <span className="text-muted-foreground mt-1 text-sm">
                    {t.description}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingId(t.id);
                    setForm(formFromTemplate(t));
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    setStatus.isPending && setStatus.variables.id === t.id
                  }
                  onClick={() =>
                    setStatus.mutate({
                      id: t.id,
                      status: t.status === "active" ? "paused" : "active",
                    })
                  }
                >
                  {t.status === "active" ? "Pause" : "Resume"}
                </Button>
                <ConfirmDialog
                  title={`Delete the ${t.title} template?`}
                  description="Future classes from this template stop being scheduled. Classes already on the calendar stay. This can't be undone."
                  confirmLabel="Delete template"
                  variant="destructive"
                  onConfirm={async () => {
                    await remove.mutateAsync({ id: t.id });
                  }}
                  trigger={
                    <Button
                      size="sm"
                      variant="destructive-outline"
                      disabled={
                        remove.isPending && remove.variables.id === t.id
                      }
                    >
                      Delete
                    </Button>
                  }
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={shown !== null}
        onOpenChange={(next) => !next && closeForm()}
      >
        <DialogContent className="max-h-[90dvh] max-w-xl gap-0 overflow-hidden p-0 sm:p-0">
          {shown !== null && (
            <form
              className="flex min-h-0 flex-col"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <div className="shrink-0 border-b px-5 py-5 sm:px-6">
                <DialogTitle className="text-xl">
                  {openId ? "Edit template" : "New template"}
                </DialogTitle>
                <DialogDescription className="mt-1 pr-6">
                  Set the weekly schedule for a recurring class.
                </DialogDescription>
              </div>
              <div className="min-h-0 space-y-6 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tpl-title">Class name</Label>
                  <Input
                    id="tpl-title"
                    value={shown.title}
                    onChange={(e) => {
                      setForm({ ...shown, title: e.target.value });
                      setTitleError(false);
                    }}
                    placeholder="Evening No-Gi"
                    maxLength={80}
                    required
                    aria-invalid={titleError ? true : undefined}
                    aria-describedby={
                      titleError ? "tpl-title-error" : undefined
                    }
                  />
                  {titleError && (
                    <FieldError id="tpl-title-error">
                      Give the class a name.
                    </FieldError>
                  )}
                </div>
                <section
                  aria-labelledby="tpl-schedule-heading"
                  className="space-y-4 border-y py-5"
                >
                  <h3
                    id="tpl-schedule-heading"
                    className="text-muted-foreground font-mono text-xs tracking-wider uppercase"
                  >
                    Weekly schedule
                  </h3>
                  <fieldset className="min-w-0">
                    <legend className="mb-2 text-sm font-medium">
                      Repeat on
                    </legend>
                    <div className="grid grid-cols-7 gap-1 sm:gap-2">
                      {DAY_LABELS.map((label, day) => {
                        const on = shown.daysOfWeek.includes(day);
                        return (
                          <Button
                            key={day}
                            id={`tpl-day-${day}`}
                            type="button"
                            variant="outline"
                            aria-pressed={on}
                            aria-describedby="tpl-days-help"
                            onClick={() => {
                              setDaysError(false);
                              setForm({
                                ...shown,
                                daysOfWeek: on
                                  ? shown.daysOfWeek.filter((d) => d !== day)
                                  : [...shown.daysOfWeek, day],
                              });
                            }}
                            className={cn(
                              "h-11 min-w-0 flex-col gap-1 px-0 text-xs sm:text-sm",
                              on &&
                                "border-foreground bg-secondary text-foreground hover:bg-secondary/80",
                            )}
                          >
                            {label}
                            <span
                              aria-hidden="true"
                              className={cn(
                                "h-0.5 w-3 rounded-full",
                                on ? "bg-foreground" : "bg-transparent",
                              )}
                            />
                          </Button>
                        );
                      })}
                    </div>
                    <p
                      id="tpl-days-help"
                      role={daysError ? "alert" : undefined}
                      className={cn(
                        "mt-2 text-xs",
                        daysError ? "text-error" : "text-muted-foreground",
                      )}
                    >
                      {daysError
                        ? "Choose at least one day."
                        : shown.daysOfWeek.length > 0
                          ? `Repeats every ${DAY_LABELS.filter((_, day) => shown.daysOfWeek.includes(day)).join(", ")}.`
                          : "Choose the days this class repeats each week."}
                    </p>
                  </fieldset>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="tpl-time">Start time</Label>
                      <Input
                        id="tpl-time"
                        type="time"
                        className="font-mono tabular-nums dark:[color-scheme:dark]"
                        value={shown.time}
                        onChange={(e) =>
                          setForm({ ...shown, time: e.target.value })
                        }
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="tpl-duration">Duration (min)</Label>
                      <Input
                        id="tpl-duration"
                        type="number"
                        className="font-mono tabular-nums"
                        min={5}
                        max={600}
                        value={shown.durationMinutes}
                        onChange={(e) =>
                          setForm({
                            ...shown,
                            durationMinutes: e.target.valueAsNumber,
                          })
                        }
                        required
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="tpl-capacity">Capacity</Label>
                      <Input
                        id="tpl-capacity"
                        type="number"
                        className="font-mono tabular-nums"
                        min={0}
                        max={1000}
                        value={shown.capacity}
                        onChange={(e) =>
                          setForm({
                            ...shown,
                            capacity: e.target.valueAsNumber,
                          })
                        }
                        required
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <p className="text-muted-foreground text-xs">Time zone</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs break-all">
                        {shown.timeZone}
                      </span>
                      {shown.timeZone === academyTz ? (
                        <span className="text-muted-foreground text-xs">
                          Set in academy settings.
                        </span>
                      ) : (
                        <>
                          <span className="text-muted-foreground text-xs">
                            Your academy runs on {academyTz}.
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setForm({ ...shown, timeZone: academyTz })
                            }
                          >
                            Move to {academyTz}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </section>
                <section
                  aria-labelledby="tpl-details-heading"
                  className="space-y-4"
                >
                  <h3
                    id="tpl-details-heading"
                    className="text-muted-foreground font-mono text-xs tracking-wider uppercase"
                  >
                    Class details
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2 [&>div]:min-w-0">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="tpl-instructor">Coach</Label>
                      <Select
                        className="w-full min-w-0"
                        id="tpl-instructor"
                        value={shown.instructorId}
                        onChange={(e) =>
                          setForm({ ...shown, instructorId: e.target.value })
                        }
                      >
                        <InstructorOptions
                          value={shown.instructorId}
                          fallbackLabel={
                            editingTemplate?.instructorName ?? "You"
                          }
                          noneLabel={bjj ? undefined : "Nobody"}
                        />
                      </Select>
                    </div>
                    {bjj && (
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="tpl-discipline">Discipline</Label>
                        <Select
                          className="w-full min-w-0"
                          id="tpl-discipline"
                          value={shown.discipline}
                          onChange={(e) =>
                            setForm({
                              ...shown,
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
                    )}
                    {bjj && tracks.length > 1 && (
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="tpl-track">Curriculum</Label>
                        <Select
                          className="w-full min-w-0"
                          id="tpl-track"
                          value={shown.curriculumTrackId}
                          onChange={(e) =>
                            setForm({
                              ...shown,
                              curriculumTrackId: e.target.value,
                            })
                          }
                        >
                          <option value="">
                            {defaultTrack
                              ? `${defaultTrack.name} (default)`
                              : "Default"}
                          </option>
                          {tracks
                            .filter((t) => !t.isDefault)
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                        </Select>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="tpl-description">
                      Description{" "}
                      <span className="text-muted-foreground font-normal">
                        (optional)
                      </span>
                    </Label>
                    <Textarea
                      id="tpl-description"
                      rows={2}
                      className="min-h-20 resize-y"
                      maxLength={500}
                      value={shown.description}
                      placeholder="What should students know about this class?"
                      onChange={(e) =>
                        setForm({ ...shown, description: e.target.value })
                      }
                    />
                  </div>
                  <label className="hover:bg-muted/50 flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors">
                    <input
                      type="checkbox"
                      className={cn(
                        "accent-primary mt-0.5 size-5 shrink-0 rounded-sm",
                        FOCUS_RING,
                      )}
                      checked={shown.publicBookable}
                      aria-describedby="tpl-public-help"
                      onChange={(e) =>
                        setForm({ ...shown, publicBookable: e.target.checked })
                      }
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">
                        Share this class publicly
                      </span>
                      <span
                        id="tpl-public-help"
                        className="text-muted-foreground mt-1 block text-xs leading-relaxed"
                      >
                        Show this class on your public booking page.
                      </span>
                    </span>
                  </label>
                </section>
              </div>
              <div className="flex shrink-0 items-center justify-end gap-2 border-t px-5 py-4 sm:px-6">
                <Button type="button" variant="ghost" onClick={closeForm}>
                  Cancel
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy && <Spinner size="sm" className="text-current" />}
                  {busy
                    ? "Saving…"
                    : openId
                      ? "Save changes"
                      : "Create template"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {owner && <RebuildSchedule />}
    </section>
  );
}

/**
 * Rebuild the forward schedule (spec O3, ADR 79). Owner-only. v1 runs no
 * scheduler, so this is the one thing that clears out the classes a paused or
 * deleted template left behind, and the one thing that refills six months after
 * the templates change. The preview names the damage before the owner commits:
 * bookings on those classes go with them.
 */
function RebuildSchedule() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const academy = useEntity();
  const preview = useQuery(trpc.template.rebuildPreview.queryOptions());

  const extend = useMutation(
    trpc.template.extend.mutationOptions({
      onSuccess: async (res) => {
        await queryClient.invalidateQueries(trpc.class.pathFilter());
        await queryClient.invalidateQueries(trpc.template.pathFilter());
        toast.success(
          res.created === 0
            ? "Schedule is already extended"
            : `Generated ${res.created} ${res.created === 1 ? "class" : "classes"}`,
        );
      },
      onError: (e) =>
        toast.error(e.message || "Couldn't extend the schedule. Try again."),
    }),
  );

  const rebuild = useMutation(
    trpc.template.rebuild.mutationOptions({
      onSuccess: async (res) => {
        await queryClient.invalidateQueries(trpc.class.pathFilter());
        await queryClient.invalidateQueries(trpc.template.pathFilter());
        await queryClient.invalidateQueries(trpc.booking.pathFilter());
        toast.success(
          `Rebuilt: ${res.cancelled} cancelled, ${res.created} generated`,
        );
      },
      onError: (e) =>
        toast.error(e.message || "Couldn't rebuild the schedule. Try again."),
    }),
  );

  const affected = preview.data?.affected ?? [];
  const activeBookings = affected.reduce(
    (sum, item) => sum + item.activeParticipants + item.activeVisitors,
    0,
  );
  const records = affected.reduce(
    (sum, item) => sum + item.otherParticipations + item.otherVisits,
    0,
  );
  const generatedThrough = preview.data?.generatedThrough
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeZone: academy.timeZone ?? "UTC",
      }).format(preview.data.generatedThrough)
    : null;

  const damage =
    affected.length === 0
      ? "Nothing is stale right now."
      : `Cancels ${affected.length} upcoming ${affected.length === 1 ? "class" : "classes"}.`;

  return (
    <div className="mt-4 flex flex-col gap-3 border-t pt-6">
      <div>
        <SectionHeading>Rebuild schedule</SectionHeading>
        <p className="text-muted-foreground text-sm">
          Extend the calendar to six months, or review classes that no longer
          match an active template.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
        <div>
          <p className="text-sm font-medium">{damage}</p>
          <p className="text-muted-foreground text-sm">
            {generatedThrough
              ? `Recurring classes are generated through ${generatedThrough}.`
              : "There is no active recurring schedule."}
          </p>
          {activeBookings > 0 && (
            <p className="text-destructive text-sm">
              {activeBookings} active{" "}
              {activeBookings === 1 ? "booking blocks" : "bookings block"} this
              rebuild. Cancel those classes first.
            </p>
          )}
          {records > 0 && (
            <p className="text-muted-foreground text-sm">
              {records} historical or cancelled{" "}
              {records === 1 ? "record stays" : "records stay"} attached.
            </p>
          )}
          {affected.length > 0 && (
            <ul className="text-muted-foreground mt-2 space-y-1 text-sm">
              {affected.map((item) => (
                <li key={item.id}>
                  {item.title},{" "}
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: academy.timeZone ?? "UTC",
                  }).format(item.startsAt)}
                  : cancel
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={extend.isPending}
            onClick={() => extend.mutate()}
          >
            {extend.isPending ? "Extending…" : "Extend schedule"}
          </Button>
          <ConfirmDialog
            title="Rebuild the schedule?"
            description={`${damage} Past classes, one-off classes, cancelled classes, participation, and visitor records stay.`}
            confirmLabel="Rebuild schedule"
            variant="destructive"
            onConfirm={async () => {
              if (preview.data) {
                await rebuild.mutateAsync({ version: preview.data.version });
              }
            }}
            trigger={
              <Button
                size="sm"
                variant="destructive-outline"
                disabled={
                  rebuild.isPending ||
                  preview.isPending ||
                  !preview.data ||
                  activeBookings > 0
                }
              >
                {rebuild.isPending ? "Rebuilding…" : "Rebuild schedule"}
              </Button>
            }
          />
        </div>
      </div>
    </div>
  );
}
