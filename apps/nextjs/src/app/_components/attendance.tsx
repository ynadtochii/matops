"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Select } from "@matops/ui/select";

import { useTRPC } from "~/trpc/react";
import { ClassRoster } from "./class-roster";
import { EmptyState, ErrorState } from "./states";

const DAY_MS = 24 * 60 * 60 * 1000;

const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * O5 Attendance (spec O5, slice 3.3). Staff pick a class from the backfill
 * window (today back 14 days) and work its roster — the shared `ClassRoster`
 * panel, which the O2 schedule's class modal shows too.
 */
export function Attendance() {
  const trpc = useTRPC();
  const [classId, setClassId] = useState<string>("");

  // The backfill window: 14 days back through the end of today.
  const { from, to } = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getTime() - 14 * DAY_MS);
    const end = new Date(now.getTime() + DAY_MS);
    return { from: start.toISOString(), to: end.toISOString() };
  }, []);

  const classes = useQuery(trpc.class.week.queryOptions({ from, to }));

  // Most-recent classes first for the picker (week read is ascending).
  const options = useMemo(
    () => [...(classes.data ?? [])].reverse(),
    [classes.data],
  );
  const selected = options.find((c) => c.id === classId);

  return (
    <section className="flex flex-col gap-4">
      <Select
        aria-label="Class to take attendance for"
        value={classId}
        onChange={(e) => setClassId(e.target.value)}
        className="w-full"
      >
        <option value="">Pick a class…</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {dateTimeFmt.format(new Date(c.startsAt))} · {c.title}
            {c.status === "cancelled" ? " (cancelled)" : ""}
          </option>
        ))}
      </Select>

      {classes.isError ? (
        <ErrorState
          label="your classes"
          onRetry={() => void classes.refetch()}
        />
      ) : selected ? (
        <ClassRoster key={selected.id} cls={selected} />
      ) : !classes.isPending && options.length === 0 ? (
        <EmptyState title="No recent classes.">
          Attendance opens once a class has run. Add classes on the schedule.
        </EmptyState>
      ) : null}
    </section>
  );
}
