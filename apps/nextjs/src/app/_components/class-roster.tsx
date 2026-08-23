"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import {
  attendanceCounts,
  bulkMarkTargets,
  canMarkAttendance,
} from "@matops/domain";
import { cn } from "@matops/ui";
import { Button } from "@matops/ui/button";
import { Input } from "@matops/ui/input";
import { Separator } from "@matops/ui/separator";
import { toast } from "@matops/ui/toast";
import { AddVisitorSchema } from "@matops/validators";

import { useTRPC } from "~/trpc/react";
import { CoachSelect } from "./coach-select";
import { cardClass } from "./primitives";
import { SkeletonRoster } from "./skeletons";
import { EmptyState, ErrorState } from "./states";

type ClassRow = RouterOutputs["class"]["week"][number];

const BLANK_VISITOR = { firstName: "", lastName: "", phone: "" };

type Mark = "present" | "absent";

function MarkDot({ kind, filled }: { kind: Mark; filled: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-2 shrink-0 rounded-full border",
        filled
          ? kind === "present"
            ? "bg-success border-success"
            : "bg-error border-error"
          : "border-muted-foreground/60",
      )}
    />
  );
}

function segmentClass(kind: Mark, selected: boolean) {
  return cn(
    "inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-sm px-3 text-sm transition-colors sm:min-h-7 sm:flex-none",
    "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
    selected
      ? cn(
          "text-foreground font-medium",
          kind === "present" ? "bg-success/15" : "bg-error/15",
        )
      : "text-muted-foreground hover:text-foreground",
  );
}

/**
 * Everyone on one class (spec O5): booked + walk-ins with their marks, the
 * summary counts, mark present/absent, mark-all-present, and the walk-in
 * picker. Used by the O5 Attendance screen and by the O2 schedule's class
 * detail modal. Outside the marking window (a class further out than tomorrow,
 * or older than the 14-day backfill) it degrades to a read-only attendee list,
 * because the server refuses to mark there anyway.
 */
export function ClassRoster({ cls }: { cls: ClassRow }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const classId = cls.id;
  const [walkInIds, setWalkInIds] = useState<Set<string>>(new Set());
  const [walkInQuery, setWalkInQuery] = useState("");
  const [visitor, setVisitor] = useState(BLANK_VISITOR);

  const canMark = canMarkAttendance(
    {
      status: cls.status,
      startsAt: new Date(cls.startsAt),
      deletedAt: cls.deletedAt ? new Date(cls.deletedAt) : null,
    },
    new Date(),
  );

  const classList = useQuery(
    trpc.attendance.list.queryOptions({ id: classId }),
  );
  const members = useQuery({
    ...trpc.attendance.members.queryOptions(),
    enabled: canMark,
  });

  // The week read carries `markedCount`, which the O1 dashboard turns into its
  // "classes to mark" queue. Refetching it per mark would re-run two correlated
  // count subqueries per class row for every tap, so it waits until the roster
  // closes instead.
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) return;
    return () => {
      void queryClient.invalidateQueries(trpc.class.pathFilter());
    };
  }, [touched, queryClient, trpc]);

  const invalidate = async () => {
    setTouched(true);
    await queryClient.invalidateQueries(trpc.attendance.list.pathFilter());
  };
  const onError = (err: { message: string }) =>
    toast.error(err.message || "Action failed");

  // Optimistic marking: the list for the active class updates instantly so
  // tapping through attendance feels immediate, then the background refetch
  // (onSettled) reconciles with the server. On error we roll the cache back.
  const listKey = (id: string) => trpc.attendance.list.queryKey({ id });

  const mark = useMutation(
    trpc.attendance.mark.mutationOptions({
      onMutate: async (vars) => {
        const key = listKey(vars.classId);
        await queryClient.cancelQueries({ queryKey: key });
        const prev = queryClient.getQueryData(key);
        queryClient.setQueryData(key, (old) => {
          if (!old) return old;
          const rows = old.rows.map((r) =>
            r.studentId === vars.studentId
              ? { ...r, attendanceStatus: vars.status }
              : r,
          );
          return { ...old, rows, counts: attendanceCounts(rows) };
        });
        return { key, prev };
      },
      onError: (err, _vars, ctx) => {
        if (ctx) queryClient.setQueryData(ctx.key, ctx.prev);
        onError(err);
      },
      onSettled: () => invalidate(),
    }),
  );
  const addWalkIn = useMutation(trpc.attendance.addWalkIn.mutationOptions({}));

  const addVisitor = useMutation(
    trpc.attendance.addVisitor.mutationOptions({
      onSuccess: ({ firstVisit, visitCount }) => {
        setVisitor(BLANK_VISITOR);
        toast.success(
          firstVisit
            ? "Visitor added to your drop-in leads"
            : `Visitor added — visit ${visitCount}`,
        );
      },
      onError,
      onSettled: () => invalidate(),
    }),
  );

  const addSelectedWalkIns = async () => {
    const ids = [...walkInIds];
    const results = await Promise.allSettled(
      ids.map((studentId) => addWalkIn.mutateAsync({ classId, studentId })),
    );
    setWalkInIds(new Set());
    await invalidate();
    const added = results.filter((r) => r.status === "fulfilled").length;
    if (added > 0) {
      toast.success(`Added ${added} walk-in${added === 1 ? "" : "s"}`);
    }
    const failed = results.find((r) => r.status === "rejected");
    if (failed) onError(failed.reason as { message: string });
  };

  const markAll = useMutation(
    trpc.attendance.markAll.mutationOptions({
      onMutate: async (vars) => {
        const key = listKey(vars.id);
        await queryClient.cancelQueries({ queryKey: key });
        const prev = queryClient.getQueryData(key);
        queryClient.setQueryData(key, (old) => {
          if (!old) return old;
          const targets = new Set(bulkMarkTargets(old.rows));
          const rows = old.rows.map((r) =>
            targets.has(r.studentId)
              ? { ...r, attendanceStatus: "present" as const }
              : r,
          );
          return { ...old, rows, counts: attendanceCounts(rows) };
        });
        return { key, prev };
      },
      onError: (err, _vars, ctx) => {
        if (ctx) queryClient.setQueryData(ctx.key, ctx.prev);
        onError(err);
      },
      onSuccess: ({ marked }) => {
        toast.success(
          marked === 0
            ? "Everyone was already marked"
            : `Marked ${marked} present`,
        );
      },
      onSettled: () => invalidate(),
    }),
  );

  if (classList.isPending) return <SkeletonRoster />;
  if (classList.isError) {
    return (
      <ErrorState
        label="the class list"
        onRetry={() => void classList.refetch()}
      />
    );
  }

  // Members not already on the class list — the walk-in candidates.
  const onList = new Set(classList.data.rows.map((r) => r.studentId));
  const walkInCandidates = (members.data ?? []).filter(
    (m) => !onList.has(m.id),
  );
  const query = walkInQuery.trim().toLowerCase();
  const matchingCandidates = query
    ? walkInCandidates.filter((m) => m.name.toLowerCase().includes(query))
    : walkInCandidates;
  const counts = classList.data.counts;
  const dropIns = classList.data.dropIns;
  // Gate on the same schema the server enforces, so a name or phone the API
  // would reject never gets as far as a failed round trip.
  const visitorValid = AddVisitorSchema.safeParse({
    classId,
    ...visitor,
  }).success;

  return (
    <div className="flex flex-col gap-3">
      <CoachSelect
        classId={classId}
        startsAt={cls.startsAt}
        instructorId={cls.instructorId}
        instructorName={cls.instructorName}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          {canMark ? (
            <>
              <span className="flex items-center gap-1.5">
                <MarkDot kind="present" filled />
                {counts.present} present
              </span>
              <span className="flex items-center gap-1.5">
                <MarkDot kind="absent" filled />
                {counts.absent} absent
              </span>
              <span className="flex items-center gap-1.5">
                <MarkDot kind="present" filled={false} />
                {counts.unmarked} to mark
              </span>
            </>
          ) : (
            <span>{counts.confirmed + counts.provisional} booked</span>
          )}
          {counts.provisional > 0 && <span>{counts.provisional} pending</span>}
          {counts.walkIn > 0 && <span>{counts.walkIn} walk-in</span>}
          {dropIns.length > 0 && <span>{dropIns.length} drop-in</span>}
        </p>
        {canMark && bulkMarkTargets(classList.data.rows).length > 0 && (
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

      {classList.data.rows.length === 0 ? (
        <EmptyState title="No one booked yet.">
          {canMark
            ? "Mark people present as they arrive — add a walk-in below."
            : "Bookings will show up here."}
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {classList.data.rows.map((r) => {
            const present = r.attendanceStatus === "present";
            const absent = r.attendanceStatus === "absent";
            return (
              <li
                key={r.studentId}
                className={cn(
                  cardClass(),
                  "flex flex-wrap items-center justify-between gap-2 p-3",
                )}
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
                {canMark && (
                  <div
                    role="group"
                    aria-label={`Attendance for ${r.name ?? "member"}`}
                    className="border-border bg-muted flex w-full gap-0.5 rounded-md border p-0.5 sm:w-auto"
                  >
                    <button
                      type="button"
                      aria-pressed={present}
                      title={present ? "Clear this mark" : undefined}
                      className={segmentClass("present", present)}
                      onClick={() =>
                        mark.mutate({
                          classId,
                          studentId: r.studentId,
                          status: present ? "unmarked" : "present",
                        })
                      }
                    >
                      <MarkDot kind="present" filled={present} />
                      Present
                    </button>
                    <button
                      type="button"
                      aria-pressed={absent}
                      title={absent ? "Clear this mark" : undefined}
                      className={segmentClass("absent", absent)}
                      onClick={() =>
                        mark.mutate({
                          classId,
                          studentId: r.studentId,
                          status: absent ? "unmarked" : "absent",
                        })
                      }
                    >
                      <MarkDot kind="absent" filled={absent} />
                      Absent
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {dropIns.length > 0 && (
        <ul className="flex flex-col gap-2">
          {dropIns.map((d) => (
            <li
              key={d.id}
              className={cn(cardClass(), "flex items-center gap-2 p-3 text-sm")}
            >
              <span className="font-medium">
                {d.firstName} {d.lastName}
              </span>
              <span className="text-muted-foreground text-xs uppercase">
                drop-in
              </span>
              <span className="text-muted-foreground ml-auto text-xs">
                {d.phone}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canMark && (
        <details className={cn(cardClass(), "p-3")}>
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            Add someone who isn&apos;t listed
            <span className="text-muted-foreground font-normal">
              member or visitor
            </span>
          </summary>

          <div className="mt-4 flex flex-col gap-2">
            <p className="text-sm font-medium">Members who didn&apos;t book</p>
            {walkInCandidates.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Every active member is already on this class.
              </p>
            ) : (
              <>
                <Input
                  type="search"
                  value={walkInQuery}
                  onChange={(e) => setWalkInQuery(e.target.value)}
                  placeholder={`Search ${walkInCandidates.length} members`}
                  aria-label="Search members"
                />
                {matchingCandidates.length === 0 ? (
                  <p className="text-muted-foreground py-2 text-sm">
                    No member matches “{walkInQuery}”. Record them as a visitor
                    below.
                  </p>
                ) : (
                  <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                    {matchingCandidates.map((m) => (
                      <li key={m.id}>
                        <label className="hover:bg-muted flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm sm:min-h-9">
                          <input
                            type="checkbox"
                            className="accent-brand size-4"
                            checked={walkInIds.has(m.id)}
                            onChange={(e) =>
                              setWalkInIds((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(m.id);
                                else next.delete(m.id);
                                return next;
                              })
                            }
                          />
                          {m.name}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                <Button
                  size="sm"
                  className="self-start"
                  disabled={walkInIds.size === 0 || addWalkIn.isPending}
                  onClick={() => void addSelectedWalkIns()}
                >
                  {walkInIds.size > 0
                    ? `Mark ${walkInIds.size} present`
                    : "Mark present"}
                </Button>
              </>
            )}
          </div>

          <Separator className="my-4" />

          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              addVisitor.mutate({ classId, ...visitor });
            }}
          >
            <p className="text-sm font-medium">
              Visitor who isn&apos;t a member
            </p>
            <p className="text-muted-foreground text-sm">
              Saves them to your drop-in leads, so you can follow up after
              class.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={visitor.firstName}
                onChange={(e) =>
                  setVisitor((v) => ({ ...v, firstName: e.target.value }))
                }
                placeholder="First name"
                aria-label="Visitor first name"
                autoComplete="off"
              />
              <Input
                value={visitor.lastName}
                onChange={(e) =>
                  setVisitor((v) => ({ ...v, lastName: e.target.value }))
                }
                placeholder="Last name (optional)"
                aria-label="Visitor last name"
                autoComplete="off"
              />
              <Input
                type="tel"
                value={visitor.phone}
                onChange={(e) =>
                  setVisitor((v) => ({ ...v, phone: e.target.value }))
                }
                placeholder="Phone"
                aria-label="Visitor phone"
                autoComplete="off"
              />
            </div>
            <Button
              type="submit"
              size="sm"
              className="self-start"
              disabled={addVisitor.isPending || !visitorValid}
            >
              Add visitor
            </Button>
          </form>
        </details>
      )}
    </div>
  );
}
