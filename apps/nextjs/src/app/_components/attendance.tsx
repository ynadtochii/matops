"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  ATTENDANCE_BACKFILL_DAYS,
  attendanceWindow,
  DAY_MS,
} from "@matops/domain";
import { Select } from "@matops/ui/select";

import { dateTimeFmt } from "~/lib/format";
import { useTRPC } from "~/trpc/react";
import { ClassRoster } from "./class-roster";
import { EmptyState, ErrorState } from "./states";

/**
 * O5 Attendance (spec O5, slice 3.3). Staff pick a class from the backfill
 * window and work its roster — the shared `ClassRoster`
 * panel, which the O2 schedule's class modal shows too.
 */
export function Attendance() {
  const trpc = useTRPC();
  const [classId, setClassId] = useState<string>("");
  const [openedAt] = useState(() => Date.now());

  const classes = useQuery(
    trpc.class.week.queryOptions(attendanceWindow(new Date(openedAt))),
  );

  // The window is snapped to a UTC day so the server and the browser build the
  // same cache key. Trimming here is what keeps the picker to the real 14 days.
  const options = useMemo(() => {
    const cutoff = openedAt - ATTENDANCE_BACKFILL_DAYS * DAY_MS;
    return [...(classes.data ?? [])]
      .filter((c) => new Date(c.startsAt).getTime() >= cutoff)
      .reverse();
  }, [classes.data, openedAt]);
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
