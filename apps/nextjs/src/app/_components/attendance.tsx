"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@matops/ui/button";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";
import { EmptyState, ErrorState, SkeletonRows } from "./states";

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
 * window (today back 14 days), see everyone on it (booked + walk-ins) with their
 * mark, toggle present/absent, and add a walk-in member. Self check-ins (QR)
 * arrive already present.
 */
export function Attendance() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [classId, setClassId] = useState<string>("");
  const [walkInId, setWalkInId] = useState<string>("");

  // The backfill window: 14 days back through the end of today.
  const { from, to } = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getTime() - 14 * DAY_MS);
    const end = new Date(now.getTime() + DAY_MS);
    return { from: start.toISOString(), to: end.toISOString() };
  }, []);

  const classes = useQuery(trpc.class.week.queryOptions({ from, to }));
  const roster = useQuery({
    ...trpc.attendance.roster.queryOptions({ id: classId }),
    enabled: classId !== "",
  });
  const members = useQuery(trpc.attendance.members.queryOptions());

  const invalidate = () =>
    queryClient.invalidateQueries(trpc.attendance.roster.pathFilter());
  const onError = (err: { message: string }) =>
    toast.error(err.message || "Action failed");

  const mark = useMutation(
    trpc.attendance.mark.mutationOptions({
      onSuccess: async () => await invalidate(),
      onError,
    }),
  );
  const addWalkIn = useMutation(
    trpc.attendance.addWalkIn.mutationOptions({
      onSuccess: async () => {
        await invalidate();
        toast.success("Walk-in added");
        setWalkInId("");
      },
      onError,
    }),
  );
  const markAll = useMutation(
    trpc.attendance.markAll.mutationOptions({
      onSuccess: async ({ marked }) => {
        await invalidate();
        toast.success(
          marked === 0
            ? "Everyone was already marked"
            : `Marked ${marked} present`,
        );
      },
      onError,
    }),
  );

  // Most-recent classes first for the picker (week read is ascending).
  const options = useMemo(
    () => [...(classes.data ?? [])].reverse(),
    [classes.data],
  );

  // Members not already on the roster — the walk-in candidates.
  const onRoster = new Set((roster.data?.rows ?? []).map((r) => r.studentId));
  const walkInCandidates = (members.data ?? []).filter(
    (m) => !onRoster.has(m.id),
  );

  const counts = roster.data?.counts;

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Attendance</h2>

      <select
        value={classId}
        onChange={(e) => setClassId(e.target.value)}
        className="border-input bg-background h-9 rounded-md border px-3 text-sm"
      >
        <option value="">Pick a class…</option>
        {options.map((c) => (
          <option key={c.id} value={c.id}>
            {dateTimeFmt.format(new Date(c.startsAt))} · {c.title}
            {c.status === "cancelled" ? " (cancelled)" : ""}
          </option>
        ))}
      </select>

      {classId === "" &&
      !classes.isPending &&
      !classes.isError &&
      options.length === 0 ? (
        <EmptyState title="No recent classes.">
          Attendance opens once a class has run. Add classes on the schedule.
        </EmptyState>
      ) : classId === "" && classes.isError ? (
        <ErrorState
          label="your classes"
          onRetry={() => void classes.refetch()}
        />
      ) : classId !== "" && roster.isPending ? (
        <SkeletonRows rows={4} />
      ) : classId !== "" && roster.isError ? (
        <ErrorState
          label="the class roster"
          onRetry={() => void roster.refetch()}
        />
      ) : classId !== "" && roster.data ? (
        <div className="flex flex-col gap-3">
          {counts && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-muted-foreground text-sm">
                {counts.present} present · {counts.absent} absent ·{" "}
                {counts.unmarked} unmarked
                {counts.provisional > 0 && ` · ${counts.provisional} pending`}
                {counts.walkIn > 0 && ` · ${counts.walkIn} walk-in`}
              </p>
              {roster.data.rows.some(
                (r) =>
                  r.bookingStatus === "booked" &&
                  r.attendanceStatus === "unmarked",
              ) && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={markAll.isPending}
                  onClick={() => markAll.mutate({ id: classId })}
                >
                  Mark all present
                </Button>
              )}
            </div>
          )}

          {roster.data.rows.length === 0 ? (
            <EmptyState title="No one booked yet.">
              Mark people present as they arrive — add a walk-in below.
            </EmptyState>
          ) : (
            <ul className="flex flex-col gap-2">
              {roster.data.rows.map((r) => {
                const present = r.attendanceStatus === "present";
                const absent = r.attendanceStatus === "absent";
                return (
                  <li
                    key={r.studentId}
                    className="bg-muted flex flex-wrap items-center justify-between gap-2 rounded-lg p-3"
                  >
                    <span className="text-sm font-medium">
                      {r.name ?? "Member"}
                      {r.bookingStatus === "none" && (
                        <span className="text-muted-foreground ml-2 text-xs uppercase">
                          walk-in
                        </span>
                      )}
                      {r.bookingStatus === "booked" &&
                        r.bookingTier === "provisional" && (
                          <span className="text-muted-foreground ml-2 text-xs uppercase">
                            pending
                          </span>
                        )}
                    </span>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant={present ? "default" : "outline"}
                        disabled={mark.isPending}
                        onClick={() =>
                          mark.mutate({
                            classId,
                            studentId: r.studentId,
                            status: present ? "unmarked" : "present",
                          })
                        }
                      >
                        Present
                      </Button>
                      <Button
                        size="sm"
                        variant={absent ? "destructive" : "outline"}
                        disabled={mark.isPending}
                        onClick={() =>
                          mark.mutate({
                            classId,
                            studentId: r.studentId,
                            status: absent ? "unmarked" : "absent",
                          })
                        }
                      >
                        Absent
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={walkInId}
              onChange={(e) => setWalkInId(e.target.value)}
              className="border-input bg-background h-9 min-w-48 rounded-md border px-3 text-sm"
            >
              <option value="">Add a walk-in…</option>
              {walkInCandidates.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={walkInId === "" || addWalkIn.isPending}
              onClick={() => addWalkIn.mutate({ classId, studentId: walkInId })}
            >
              Add
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
