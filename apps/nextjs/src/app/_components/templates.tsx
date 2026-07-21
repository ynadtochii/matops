"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import {
  DAY_LABELS,
  describeRecurrence,
  formatStartMinutes,
} from "@matops/domain";
import { Button } from "@matops/ui/button";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";
import { EmptyState, ErrorState, SkeletonRows } from "./states";

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
  discipline: Discipline | "";
  daysOfWeek: number[];
  time: string; // "HH:MM"
  durationMinutes: number;
  capacity: number;
  timeZone: string;
}

const emptyForm = (): FormState => ({
  title: "",
  discipline: "",
  daysOfWeek: [],
  time: "18:00",
  durationMinutes: 60,
  capacity: 20,
  timeZone: browserTz(),
});

const formFromTemplate = (t: Template): FormState => ({
  title: t.title,
  discipline: t.discipline ?? "",
  daysOfWeek: t.daysOfWeek,
  time: formatStartMinutes(t.startsAtMinutes),
  durationMinutes: t.durationMinutes,
  capacity: t.capacity,
  timeZone: t.timeZone,
});

/**
 * Recurring class templates (spec O3). Staff define the weekly schedule here;
 * concrete classes are materialized from these (slice 2.2). The time zone
 * defaults to this browser's zone until academy settings (O6) ship.
 */
export function Templates() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const list = useQuery(trpc.template.list.queryOptions());

  const [form, setForm] = useState<FormState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

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
    trpc.template.setStatus.mutationOptions({ onSuccess: invalidate, onError }),
  );
  const remove = useMutation(
    trpc.template.delete.mutationOptions({ onSuccess: invalidate, onError }),
  );

  const busy = create.isPending || update.isPending;
  const templates = list.data ?? [];

  const submit = () => {
    if (!form) return;
    if (form.title.trim().length < 1 || form.daysOfWeek.length === 0) {
      toast.error("Add a title and pick at least one day");
      return;
    }
    const payload = {
      title: form.title.trim(),
      discipline: form.discipline === "" ? null : form.discipline,
      daysOfWeek: form.daysOfWeek,
      startsAtMinutes: timeToMinutes(form.time),
      durationMinutes: form.durationMinutes,
      capacity: form.capacity,
      timeZone: form.timeZone,
    };
    if (editingId) update.mutate({ id: editingId, ...payload });
    else create.mutate(payload);
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Recurring classes</h2>
        {form === null && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditingId(null);
              setForm(emptyForm());
            }}
          >
            New template
          </Button>
        )}
      </div>

      {list.isPending ? (
        <SkeletonRows rows={3} />
      ) : list.isError ? (
        <ErrorState label="your templates" onRetry={() => void list.refetch()} />
      ) : templates.length === 0 && form === null ? (
        <EmptyState title="No recurring classes yet.">
          Create a weekly template and matops fills the calendar for you.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-2">
          {templates.map((t) => (
            <div
              key={t.id}
              className="bg-muted flex flex-wrap items-center justify-between gap-3 rounded-lg p-4"
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
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditingId(t.id);
                    setForm(formFromTemplate(t));
                  }}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={setStatus.isPending}
                  onClick={() =>
                    setStatus.mutate({
                      id: t.id,
                      status: t.status === "active" ? "paused" : "active",
                    })
                  }
                >
                  {t.status === "active" ? "Pause" : "Resume"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ id: t.id })}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {form !== null && (
        <form
          className="bg-muted flex flex-col gap-4 rounded-lg p-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
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
                  setForm({ ...form, durationMinutes: e.target.valueAsNumber })
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
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tpl-discipline">Discipline</Label>
              <select
                id="tpl-discipline"
                value={form.discipline}
                onChange={(e) =>
                  setForm({
                    ...form,
                    discipline: e.target.value as Discipline | "",
                  })
                }
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              >
                <option value="">None</option>
                {DISCIPLINES.map((d) => (
                  <option key={d} value={d}>
                    {d.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tpl-tz">Time zone</Label>
            <Input
              id="tpl-tz"
              value={form.timeZone}
              onChange={(e) => setForm({ ...form, timeZone: e.target.value })}
              placeholder="Europe/Kyiv"
              required
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
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
    </section>
  );
}
