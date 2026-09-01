"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import {
  DAY_LABELS,
  describeRecurrence,
  formatStartMinutes,
  isOwner,
} from "@matops/domain";
import { cn } from "@matops/ui";
import { ConfirmDialog } from "@matops/ui/alert-dialog";
import { Button } from "@matops/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@matops/ui/dialog";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Select } from "@matops/ui/select";
import { Spinner } from "@matops/ui/spinner";
import { toast } from "@matops/ui/toast";

import { optimistic, rollback } from "~/lib/optimistic";
import { useTRPC } from "~/trpc/react";
import { useAcademy } from "./academy";
import { InstructorOptions } from "./coach-select";
import { cardClass, SectionHeading } from "./primitives";
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
  instructorId: t.instructorId,
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
export function Templates() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const list = useQuery(trpc.template.list.queryOptions());
  const board = useQuery(trpc.curriculum.board.queryOptions({}));
  const me = useAcademy();

  const [form, setForm] = useState<FormState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const academyTz = me.timeZone ?? browserTz();
  const owner = isOwner(me);

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.template.list.pathFilter());
  const onError = (err: { message: string }) =>
    toast.error(err.message || "Action failed");

  const closeForm = () => {
    setForm(null);
    setEditingId(null);
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
  const editingTemplate = list.data?.find((t) => t.id === editingId);
  const tracks = board.data?.tracks ?? [];
  const defaultTrack = tracks.find((t) => t.isDefault);

  const submit = () => {
    if (!form) return;
    if (form.title.trim().length < 1 || form.daysOfWeek.length === 0) {
      toast.error("Add a title and pick at least one day");
      return;
    }
    const payload = {
      title: form.title.trim(),
      instructorId: form.instructorId || undefined,
      discipline: form.discipline === "" ? null : form.discipline,
      curriculumTrackId:
        form.curriculumTrackId === "" ? null : form.curriculumTrackId,
      daysOfWeek: form.daysOfWeek,
      startsAtMinutes: timeToMinutes(form.time),
      durationMinutes: form.durationMinutes,
      capacity: form.capacity,
      timeZone: form.timeZone,
      publicBookable: form.publicBookable,
    };
    if (editingId) update.mutate({ id: editingId, ...payload });
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
        <div className="flex flex-col gap-2">
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
        open={form !== null}
        onOpenChange={(next) => !next && closeForm()}
      >
        <DialogContent>
          {form !== null && (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <DialogTitle>
                {editingId ? "Edit template" : "New template"}
              </DialogTitle>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tpl-title">Title</Label>
                <Input
                  id="tpl-title"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Evening No-Gi"
                  maxLength={80}
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label>Days</Label>
                <div className="flex flex-wrap gap-1.5">
                  {DAY_LABELS.map((label, day) => {
                    const on = form.daysOfWeek.includes(day);
                    return (
                      <button
                        key={day}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setForm({
                            ...form,
                            daysOfWeek: on
                              ? form.daysOfWeek.filter((d) => d !== day)
                              : [...form.daysOfWeek, day],
                          })
                        }
                        className={`rounded-md border px-3 py-1.5 text-sm ${
                          on
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap gap-4">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tpl-time">Start</Label>
                  <Input
                    id="tpl-time"
                    type="time"
                    value={form.time}
                    onChange={(e) => setForm({ ...form, time: e.target.value })}
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tpl-duration">Duration (min)</Label>
                  <Input
                    id="tpl-duration"
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
                  <Label htmlFor="tpl-capacity">Capacity</Label>
                  <Input
                    id="tpl-capacity"
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
                <label
                  title="Only classes you share appear on your booking link and in the public API. Kids classes and competition training stay off unless you tick this."
                  className="text-muted-foreground hover:text-foreground flex min-h-11 cursor-pointer items-center gap-2 text-sm sm:col-span-2"
                >
                  <input
                    type="checkbox"
                    className="accent-brand size-4"
                    checked={form.publicBookable}
                    onChange={(e) =>
                      setForm({ ...form, publicBookable: e.target.checked })
                    }
                  />
                  Share this class publicly
                </label>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tpl-instructor">Coach</Label>
                  <Select
                    id="tpl-instructor"
                    value={form.instructorId}
                    onChange={(e) =>
                      setForm({ ...form, instructorId: e.target.value })
                    }
                  >
                    <InstructorOptions
                      value={form.instructorId}
                      fallbackLabel={editingTemplate?.instructorName ?? "You"}
                    />
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tpl-discipline">Discipline</Label>
                  <Select
                    id="tpl-discipline"
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
                {tracks.length > 1 && (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="tpl-track">Curriculum</Label>
                    <Select
                      id="tpl-track"
                      value={form.curriculumTrackId}
                      onChange={(e) =>
                        setForm({ ...form, curriculumTrackId: e.target.value })
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
                <Label>Time zone</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm">{form.timeZone}</span>
                  {form.timeZone === academyTz ? (
                    <span className="text-muted-foreground text-xs">
                      Your academy time zone, set in Settings.
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
                          setForm({ ...form, timeZone: academyTz })
                        }
                      >
                        Move to {academyTz}
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={busy}>
                  {busy && <Spinner size="sm" className="text-current" />}
                  {busy
                    ? "Saving…"
                    : editingId
                      ? "Save changes"
                      : "Create template"}
                </Button>
                <Button type="button" variant="ghost" onClick={closeForm}>
                  Cancel
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
  const preview = useQuery(trpc.template.rebuildPreview.queryOptions());

  const rebuild = useMutation(
    trpc.template.rebuild.mutationOptions({
      onSuccess: async (res) => {
        await queryClient.invalidateQueries(trpc.class.pathFilter());
        await queryClient.invalidateQueries(trpc.template.pathFilter());
        await queryClient.invalidateQueries(trpc.booking.pathFilter());
        toast.success(
          `Rebuilt: ${res.deleted} removed, ${res.created} generated`,
        );
      },
      onError: (e) =>
        toast.error(e.message || "Could not rebuild the schedule"),
    }),
  );

  const toDelete = preview.data?.toDelete ?? 0;
  const bookings = preview.data?.bookingsAffected ?? 0;

  const damage =
    toDelete === 0
      ? "Nothing is stale right now."
      : `Removes ${toDelete} upcoming ${toDelete === 1 ? "class" : "classes"}` +
        (bookings > 0
          ? ` and ${bookings} ${bookings === 1 ? "booking" : "bookings"}.`
          : ".");

  return (
    <div className="mt-4 flex flex-col gap-3 border-t pt-6">
      <div>
        <SectionHeading>Rebuild schedule</SectionHeading>
        <p className="text-muted-foreground text-sm">
          Regenerates every class from your active templates, six months ahead.
          Use it after pausing or deleting a template: its classes stay on the
          calendar until you do.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
        <div>
          <p className="text-sm font-medium">{damage}</p>
          <p className="text-muted-foreground text-sm">
            Past classes and their attendance are never touched. One-off classes
            you added by hand stay.
          </p>
        </div>
        <ConfirmDialog
          title="Rebuild the schedule?"
          description={`${damage} Students lose those bookings without being told. Your templates, past classes, attendance history and one-off classes are unaffected.`}
          confirmLabel="Rebuild schedule"
          variant="destructive"
          onConfirm={async () => {
            await rebuild.mutateAsync();
          }}
          trigger={
            <Button
              size="sm"
              variant="destructive-outline"
              disabled={rebuild.isPending || preview.isPending}
            >
              {rebuild.isPending ? "Rebuilding…" : "Rebuild schedule"}
            </Button>
          }
        />
      </div>
    </div>
  );
}
