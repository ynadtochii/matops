"use client";

import type { ReactNode } from "react";
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
import { FOCUS_RING } from "@matops/ui/motion";
import { Separator } from "@matops/ui/separator";
import { toast } from "@matops/ui/toast";
import { AddVisitorSchema } from "@matops/validators";

import { optimistic, rollback } from "~/lib/optimistic";
import { useInvalidate } from "~/trpc/invalidate";
import { useTRPC } from "~/trpc/react";
import { useAcademy } from "./academy";
import { ClassTheme } from "./class-theme";
import { CoachSelect } from "./coach-select";
import { PhoneField } from "./form-fields";
import {
  cardClass,
  CheckIcon,
  Eyebrow,
  PlusIcon,
  ROSTER_LIST,
  ROSTER_ROW,
  XIcon,
} from "./primitives";
import { SkeletonRoster } from "./skeletons";
import { EmptyState, ErrorState } from "./states";

type ClassRow = RouterOutputs["class"]["week"][number];

const BLANK_VISITOR = { firstName: "", lastName: "", phone: "" };

type Mark = "present" | "absent";

function MarkDot({
  kind,
  filled,
  className,
}: {
  kind: Mark;
  filled: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-2.5 shrink-0 rounded-full border transition-colors",
        filled
          ? kind === "present"
            ? "bg-success border-success"
            : "bg-error border-error"
          : "border-muted-foreground/60",
        className,
      )}
    />
  );
}

/**
 * How far through the class the marking is. The rule is stacked, so its two
 * segments carry the present/absent split as well as the progress; the figures
 * beside it are the readable copy of the same fact.
 */
function MarkRule({
  present,
  absent,
  total,
}: {
  present: number;
  absent: number;
  total: number;
}) {
  if (total === 0) return null;
  const pct = (n: number) => `${(n / total) * 100}%`;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={present + absent}
      aria-label={`${present + absent} of ${total} marked`}
      className="bg-border flex h-0.5 w-full overflow-hidden rounded-full"
    >
      <span
        className="bg-success transition-[width] duration-300 motion-reduce:transition-none"
        style={{ width: pct(present) }}
      />
      <span
        className="bg-error transition-[width] duration-300 motion-reduce:transition-none"
        style={{ width: pct(absent) }}
      />
    </div>
  );
}

function segmentClass(kind: Mark, selected: boolean) {
  return cn(
    "inline-flex min-h-10 min-w-11 items-center justify-center rounded-sm px-2.5 text-sm transition-colors sm:min-h-8 sm:min-w-0",
    "outline-none",
    FOCUS_RING,
    selected
      ? cn(
          "text-foreground font-medium",
          kind === "present" ? "bg-success/15" : "bg-error/15",
        )
      : "text-muted-foreground hover:text-foreground",
  );
}

/** A quiet uppercase note beside a name: walk-in, pending, drop-in. */
function RowTag({ children }: { children: ReactNode }) {
  return (
    <span className="text-muted-foreground shrink-0 font-mono text-[10px] tracking-wide uppercase">
      {children}
    </span>
  );
}

/**
 * Everyone on one class (spec O5): booked + walk-ins with their marks, the
 * summary counts, mark present/absent, mark-all-present, and the walk-in
 * picker. Used by the O5 Attendance screen and by the O2 schedule's class
 * detail modal. Outside the marking window (a class further out than tomorrow,
 * or older than the 14-day backfill) it degrades to a read-only attendee list,
 * because the server refuses to mark there anyway.
 *
 * The list owns its own scroll: the tally and Mark all present stay in place
 * while a long roster moves under them, which is the whole job on the mat.
 */
export function ClassRoster({ cls }: { cls: ClassRow }) {
  const trpc = useTRPC();
  const academy = useAcademy();
  const queryClient = useQueryClient();
  const invalidateFor = useInvalidate();
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
  // Fired here, not left to <ClassTheme> to start on mount: the roster is behind
  // a skeleton gate, so a query that only begins once the gate lifts lands a
  // second later and shoves the whole dialog down. Same query options, so React
  // Query serves ClassTheme from cache — one request, one layout swap.
  const theme = useQuery(
    trpc.curriculum.forClass.queryOptions({ id: classId }),
  );

  // The week read carries `markedCount`, which the O1 dashboard turns into its
  // "classes to mark" queue. Refetching it per mark would re-run two correlated
  // count subqueries per class row for every tap, so it waits until the roster
  // closes instead.
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) return;
    return () => {
      void invalidateFor("attendance");
    };
  }, [touched, invalidateFor]);

  const invalidate = async () => {
    setTouched(true);
    await queryClient.invalidateQueries(trpc.attendance.list.pathFilter());
  };
  const onError = (err: { message: string }) =>
    toast.error(err.message || "Action failed");

  const listKey = (id: string) => trpc.attendance.list.queryKey({ id });

  const mark = useMutation(
    trpc.attendance.mark.mutationOptions({
      onMutate: (vars) =>
        optimistic(queryClient, listKey(vars.classId), (old) => {
          const rows = old.rows.map((r) =>
            r.studentId === vars.studentId
              ? { ...r, attendanceStatus: vars.status }
              : r,
          );
          return { ...old, rows, counts: attendanceCounts(rows) };
        }),
      onError: (err, _vars, ctx) => {
        rollback(queryClient, ctx);
        onError(err);
      },
      onSettled: () => invalidate(),
    }),
  );
  const addWalkIn = useMutation(trpc.attendance.addWalkIn.mutationOptions({}));

  const markVisitor = useMutation(
    trpc.attendance.markVisitor.mutationOptions({
      onError,
      onSettled: () => invalidate(),
    }),
  );

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
      onMutate: (vars) =>
        optimistic(queryClient, listKey(vars.id), (old) => {
          const targets = new Set(bulkMarkTargets(old.rows));
          const rows = old.rows.map((r) =>
            targets.has(r.studentId)
              ? { ...r, attendanceStatus: "present" as const }
              : r,
          );
          return { ...old, rows, counts: attendanceCounts(rows) };
        }),
      onError: (err, _vars, ctx) => {
        rollback(queryClient, ctx);
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

  if (classList.isPending || theme.isPending) return <SkeletonRoster />;
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
  const rows = classList.data.rows;
  const counts = classList.data.counts;
  const dropIns = classList.data.dropIns;
  const pendingMarks = bulkMarkTargets(rows).length;
  // Gate on the same schema the server enforces, so a name or phone the API
  // would reject never gets as far as a failed round trip.
  const visitorValid = AddVisitorSchema.safeParse({
    classId,
    ...visitor,
  }).success;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <ClassTheme classId={classId} />
        <CoachSelect
          classId={classId}
          startsAt={cls.startsAt}
          instructorId={cls.instructorId}
          instructorName={cls.instructorName}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs tabular-nums">
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
                {counts.unmarked > 0 ? (
                  <span className="text-foreground flex items-center gap-1.5">
                    <MarkDot kind="present" filled={false} />
                    {counts.unmarked} to mark
                  </span>
                ) : (
                  rows.length > 0 && (
                    <span className="text-success">All marked</span>
                  )
                )}
              </>
            ) : (
              <span>{counts.confirmed + counts.provisional} booked</span>
            )}
            {counts.provisional > 0 && (
              <span>{counts.provisional} pending</span>
            )}
            {counts.walkIn > 0 && <span>{counts.walkIn} walk-in</span>}
            {dropIns.length > 0 && <span>{dropIns.length} drop-in</span>}
          </p>
          {canMark && pendingMarks > 0 && (
            <Button
              size="sm"
              variant="outline"
              busy={markAll.isPending}
              disabled={markAll.isPending}
              onClick={() => markAll.mutate({ id: classId })}
            >
              Mark all present
            </Button>
          )}
        </div>
        {canMark && (
          <MarkRule
            present={counts.present}
            absent={counts.absent}
            total={rows.length}
          />
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No one booked yet.">
          {canMark
            ? "Mark people present as they arrive — add a walk-in below."
            : "Bookings will show up here."}
        </EmptyState>
      ) : (
        <ul className={ROSTER_LIST}>
          {rows.map((r) => {
            const present = r.attendanceStatus === "present";
            const absent = r.attendanceStatus === "absent";
            const name = r.name ?? "Member";
            return (
              <li key={r.studentId} className={ROSTER_ROW}>
                {canMark && (
                  <MarkDot
                    kind={absent ? "absent" : "present"}
                    filled={present || absent}
                  />
                )}
                <span className="min-w-0 flex-1 truncate text-sm" title={name}>
                  {name}
                </span>
                {r.bookingStatus === "none" && <RowTag>walk-in</RowTag>}
                {r.bookingStatus === "booked" &&
                  r.bookingTier === "provisional" && <RowTag>pending</RowTag>}
                {canMark && (
                  <div
                    role="group"
                    aria-label={`Attendance for ${name}`}
                    className="border-border bg-muted flex shrink-0 gap-0.5 rounded-md border p-0.5"
                  >
                    <button
                      type="button"
                      aria-pressed={present}
                      aria-label={present ? `Clear ${name}` : `${name} present`}
                      className={segmentClass("present", present)}
                      onClick={() =>
                        mark.mutate({
                          classId,
                          studentId: r.studentId,
                          status: present ? "unmarked" : "present",
                        })
                      }
                    >
                      <CheckIcon className="sm:hidden" />
                      <span className="hidden sm:inline">Present</span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={absent}
                      aria-label={absent ? `Clear ${name}` : `${name} absent`}
                      className={segmentClass("absent", absent)}
                      onClick={() =>
                        mark.mutate({
                          classId,
                          studentId: r.studentId,
                          status: absent ? "unmarked" : "absent",
                        })
                      }
                    >
                      <XIcon className="sm:hidden" />
                      <span className="hidden sm:inline">Absent</span>
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {dropIns.length > 0 && (
        <div className="flex flex-col gap-2">
          <Eyebrow>Drop-ins</Eyebrow>
          <ul className={ROSTER_LIST}>
            {dropIns.map((d) => {
              const present = d.attendanceStatus === "present";
              const absent = d.attendanceStatus === "absent";
              const name = `${d.firstName} ${d.lastName}`.trim();
              return (
                <li key={d.id} className={ROSTER_ROW}>
                  {canMark && (
                    <MarkDot
                      kind={absent ? "absent" : "present"}
                      filled={present || absent}
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {name}
                  </span>
                  {d.bookingStatus === "booked" && <RowTag>booked</RowTag>}
                  <span className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums">
                    {d.phone}
                  </span>
                  {canMark && (
                    <div
                      role="group"
                      aria-label={`Attendance for ${name}`}
                      className="border-border bg-muted flex shrink-0 gap-0.5 rounded-md border p-0.5"
                    >
                      <button
                        type="button"
                        aria-pressed={present}
                        aria-label={
                          present ? `Clear ${name}` : `${name} present`
                        }
                        className={segmentClass("present", present)}
                        onClick={() =>
                          markVisitor.mutate({
                            classId,
                            visitId: d.id,
                            status: present ? "unmarked" : "present",
                          })
                        }
                      >
                        <CheckIcon className="sm:hidden" />
                        <span className="hidden sm:inline">Present</span>
                      </button>
                      <button
                        type="button"
                        aria-pressed={absent}
                        aria-label={absent ? `Clear ${name}` : `${name} absent`}
                        className={segmentClass("absent", absent)}
                        onClick={() =>
                          markVisitor.mutate({
                            classId,
                            visitId: d.id,
                            status: absent ? "unmarked" : "absent",
                          })
                        }
                      >
                        <XIcon className="sm:hidden" />
                        <span className="hidden sm:inline">Absent</span>
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {canMark && (
        <details className="group flex flex-col gap-2">
          <summary
            className={cn(
              cardClass({ variant: "outline", interactive: true }),
              FOCUS_RING,
              "flex cursor-pointer list-none items-center gap-2 p-3 text-sm font-medium outline-none [&::-webkit-details-marker]:hidden",
            )}
          >
            <PlusIcon className="text-muted-foreground size-3.5 transition-transform group-open:rotate-45 motion-reduce:transition-none" />
            Add someone who isn&apos;t listed
            <span className="text-muted-foreground ml-auto text-xs font-normal">
              member or visitor
            </span>
          </summary>

          <div className={cn(cardClass(), "mt-2")}>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">
                Members who didn&apos;t book
              </p>
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
                      No member matches “{walkInQuery}”. Record them as a
                      visitor below.
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
                    busy={addWalkIn.isPending}
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
                <PhoneField
                  timeZone={academy.timeZone}
                  country={academy.country}
                  label="Visitor phone"
                  hideLabel
                  value={visitor.phone}
                  onChange={(next) =>
                    setVisitor((v) => ({ ...v, phone: next }))
                  }
                />
              </div>
              <Button
                type="submit"
                size="sm"
                className="self-start"
                busy={addVisitor.isPending}
                disabled={addVisitor.isPending || !visitorValid}
              >
                Add visitor
              </Button>
            </form>
          </div>
        </details>
      )}
    </div>
  );
}
