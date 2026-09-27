"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, X } from "lucide-react";

import type { RouterOutputs } from "@matops/api";
import type { BadgeTone } from "@matops/ui/badge";
import {
  attendanceCounts,
  attendanceWriteAccess,
  bulkMarkTargets,
  classEndsAt,
  isOwner,
  isStaffRole,
  runsBranch,
} from "@matops/domain";
import { cn } from "@matops/ui";
import { Badge } from "@matops/ui/badge";
import { Button } from "@matops/ui/button";
import { Checkbox } from "@matops/ui/checkbox";
import { Input } from "@matops/ui/input";
import { Meter } from "@matops/ui/meter";
import { FOCUS_RING } from "@matops/ui/motion";
import { Separator } from "@matops/ui/separator";
import { toast } from "@matops/ui/toast";
import { useInvalidate } from "@matops/ui/use-invalidate";
import { AddVisitorSchema } from "@matops/validators";

import { optimistic, rollback } from "~/lib/optimistic";
import { useTRPC } from "~/trpc/react";
import { CoachSelect } from "./coach-select";
import { useEntity } from "./entity";
import { PhoneField } from "./form-fields";
import { cardClass, Eyebrow, ROSTER_LIST, ROSTER_ROW } from "./primitives";
import { Bar } from "./skeletons";
import { EmptyState, ErrorState } from "./states";
import { useMinuteClock } from "./use-clock";

type ClassRow = Pick<
  RouterOutputs["class"]["week"][number],
  | "id"
  | "status"
  | "startsAt"
  | "deletedAt"
  | "instructorId"
  | "instructorName"
  | "description"
  | "durationMinutes"
>;

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
        "size-2.5 shrink-0 rounded-full border transition-colors motion-reduce:transition-none",
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

function segmentClass(kind: Mark, selected: boolean) {
  return cn(
    "inline-flex min-h-10 min-w-11 items-center justify-center gap-1.5 rounded-sm px-2.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none sm:min-h-7 sm:min-w-0",
    "outline-none",
    FOCUS_RING,
    selected
      ? cn(
          "text-foreground font-medium",
          kind === "present"
            ? "bg-success/15 [&>svg]:text-success"
            : "bg-error/15 [&>svg]:text-error",
        )
      : "text-muted-foreground hover:bg-hover hover:text-foreground",
  );
}

/** A quiet note beside a name: walk-in, pending, drop-in. */
function RowTag({
  tone = "neutral",
  children,
}: {
  tone?: BadgeTone;
  children: string;
}) {
  return <Badge tone={tone}>{children}</Badge>;
}

function markTone(present: boolean, absent: boolean): BadgeTone {
  if (present) return "success";
  if (absent) return "error";
  return "neutral";
}

/**
 * The frame for a roster dialog. It sizes to its content, and its top edge is
 * pinned rather than centred, so the header stays still while the list loads
 * and only the bottom edge moves. Radix would focus the first control and light
 * its ring before anyone pressed a key, so the dialog takes focus instead.
 */
export const ROSTER_DIALOG = {
  className: "top-[8dvh] translate-y-0 overflow-hidden outline-none",
  onOpenAutoFocus: (event: Event) => {
    event.preventDefault();
    (event.currentTarget as HTMLElement).focus();
  },
};

/**
 * Everyone on one class (spec O5): booked + walk-ins with their marks, the
 * summary counts, mark present/absent, mark-all-present, and the walk-in
 * picker. Used by the O5 Attendance screen and by the O2 schedule's class
 * detail modal. Outside the marking window (a class further out than tomorrow,
 * or older than the 14-day backfill) it degrades to a read-only attendee list,
 * because the server refuses to mark there anyway.
 *
 * The tally and Mark all present stay pinned while a long roster scrolls under
 * them, which is the whole job on the mat.
 */
export function ClassRoster({
  cls,
  expectedRows,
}: {
  cls: ClassRow;
  expectedRows: number;
}) {
  const trpc = useTRPC();
  const academy = useEntity();
  const queryClient = useQueryClient();
  const invalidateFor = useInvalidate();
  const classId = cls.id;
  const now = useMinuteClock();
  const [walkInIds, setWalkInIds] = useState<Set<string>>(new Set());
  const [walkInQuery, setWalkInQuery] = useState("");
  const [visitor, setVisitor] = useState(BLANK_VISITOR);
  const [correctionReason, setCorrectionReason] = useState("");

  const writeAccess = attendanceWriteAccess(
    {
      status: cls.status,
      startsAt: new Date(cls.startsAt),
      deletedAt: cls.deletedAt ? new Date(cls.deletedAt) : null,
    },
    now,
    runsBranch(academy),
  );
  const canMark = writeAccess !== "closed";
  const reasonRequired = writeAccess === "reason-required";
  const reason = correctionReason.trim();
  const correctionReady = !reasonRequired || reason.length >= 3;

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
      void invalidateFor("attendance");
    };
  }, [touched, invalidateFor]);

  const invalidate = async () => {
    setTouched(true);
    await queryClient.invalidateQueries(trpc.attendance.pathFilter());
  };
  const onError = (err: { message: string }) =>
    toast.error(
      err.message ||
        "Couldn't finish that. Check your connection and try again.",
    );

  const listKey = (id: string) => trpc.attendance.list.queryKey({ id });

  const mark = useMutation(
    trpc.attendance.mark.mutationOptions({
      onMutate: (vars) =>
        optimistic(queryClient, listKey(vars.classId), (old) => {
          const rows = old.rows.map((r) =>
            r.studentId === vars.personId
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
            : `Visitor added. Visit ${visitCount}`,
        );
      },
      onError,
      onSettled: () => invalidate(),
    }),
  );

  const addSelectedWalkIns = async () => {
    const ids = [...walkInIds];
    const results = await Promise.allSettled(
      ids.map((studentId) =>
        addWalkIn.mutateAsync({
          classId,
          personId: studentId,
          reason: reasonRequired ? reason : undefined,
        }),
      ),
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

  const cancelFor = useMutation(
    trpc.booking.cancelFor.mutationOptions({
      onSuccess: () => {
        toast.success("Booking cancelled");
        return invalidate();
      },
      onError,
    }),
  );
  const canCancelBookings =
    isOwner(academy) &&
    cls.status === "scheduled" &&
    new Date(cls.startsAt).getTime() > now.getTime();

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

  const finish = useMutation(
    trpc.attendance.finish.mutationOptions({
      onError,
      onSuccess: async () => {
        toast.success("Attendance reviewed");
        await invalidateFor("attendance");
      },
      onSettled: () => invalidate(),
    }),
  );

  const ended =
    classEndsAt({
      startsAt: new Date(cls.startsAt),
      durationMinutes: cls.durationMinutes,
    }) <= now.getTime();
  const showsReview = ended && cls.status !== "cancelled" && !cls.deletedAt;

  const details = (
    <div className="flex flex-col gap-1.5">
      <CoachSelect
        classId={classId}
        startsAt={cls.startsAt}
        instructorId={cls.instructorId ?? ""}
        instructorName={cls.instructorName}
      />
      {cls.description && (
        <p className="text-muted-foreground text-sm">{cls.description}</p>
      )}
    </div>
  );

  // Drawn to the loaded roster's shape and row count, so a dialog that sizes
  // to its content does not jump when the list arrives.
  if (classList.isPending)
    return (
      <div className="flex flex-col gap-4">
        {details}
        <div
          role="status"
          aria-label="Loading class list"
          className="flex flex-col gap-4"
        >
          {showsReview && (
            <Bar
              className={cn("rounded-lg", reasonRequired ? "h-41" : "h-18")}
            />
          )}
          <div aria-hidden className="-mb-2 flex flex-col gap-2 pb-2">
            <div className="flex min-h-8 items-center">
              <Bar className="h-3 w-44" />
            </div>
            {canMark && expectedRows > 0 && <Bar className="h-0.5" />}
          </div>
          {expectedRows === 0 ? (
            <Bar className="h-22 rounded-lg" />
          ) : (
            <div aria-hidden className={ROSTER_LIST}>
              {Array.from({ length: Math.min(expectedRows, 12) }, (_, i) => (
                <div key={i} className={ROSTER_ROW}>
                  <Bar className="h-4 w-1/3" />
                </div>
              ))}
            </div>
          )}
          {canMark && <Bar className="h-12.75 rounded-lg" />}
        </div>
      </div>
    );
  if (classList.isError) {
    return (
      <ErrorState
        label="the class list"
        onRetry={() => void classList.refetch()}
      />
    );
  }

  // Members not already on the class list — the walk-in candidates.
  const rows = classList.data.rows.filter(
    (row) =>
      row.bookingStatus !== "cancelled" || row.attendanceStatus !== "unmarked",
  );
  const onList = new Set(rows.map((r) => r.studentId));
  const walkInCandidates = (members.data ?? []).filter(
    (m) => !onList.has(m.id),
  );
  const query = walkInQuery.trim().toLowerCase();
  const matchingCandidates = query
    ? walkInCandidates.filter((m) => m.name.toLowerCase().includes(query))
    : walkInCandidates;
  const counts = classList.data.counts;
  const review = classList.data.review;
  const saving =
    mark.isPending ||
    markAll.isPending ||
    markVisitor.isPending ||
    addWalkIn.isPending ||
    addVisitor.isPending ||
    finish.isPending;
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
      {details}
      {showsReview && (
        <div className="border-border bg-card flex flex-col gap-3 rounded-lg border p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p
                role="status"
                className="flex items-center gap-2 text-sm font-medium"
              >
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    review.reviewed ? "bg-success" : "bg-warning",
                  )}
                />
                {review.reviewed
                  ? review.present === 0
                    ? "Nobody attended, confirmed"
                    : "Attendance reviewed"
                  : "Attendance needs review"}
              </p>
              <p className="text-muted-foreground pl-3.5 text-xs">
                {review.reviewed && review.reviewedAt
                  ? `Reviewed by ${review.reviewer?.name ?? "Unknown reviewer"} on ${new Date(review.reviewedAt).toLocaleString()}. Changing the roster requires another review.`
                  : review.unmarked > 0
                    ? `Mark the remaining ${review.unmarked} ${review.unmarked === 1 ? "person" : "people"} present or absent, including visitors.`
                    : review.total === 0
                      ? "No people are listed. Add anyone who attended, or confirm that nobody attended."
                      : "Check the member and visitor marks, then finish attendance."}
              </p>
            </div>
            {!review.reviewed && canMark && (
              <Button
                size="sm"
                className="shrink-0 self-start sm:self-center"
                busy={finish.isPending}
                disabled={saving || !correctionReady}
                onClick={() =>
                  finish.mutate({
                    id: classId,
                    fingerprint: review.fingerprint,
                    nobodyAttended:
                      review.present === 0 && review.unmarked === 0,
                    reason: reasonRequired ? reason : undefined,
                  })
                }
              >
                {review.present === 0 && review.unmarked === 0
                  ? "Nobody attended"
                  : "Finish attendance"}
              </Button>
            )}
          </div>
          {reasonRequired && (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={`attendance-reason-${classId}`}
                className="text-sm font-medium"
              >
                Correction reason
              </label>
              <Input
                id={`attendance-reason-${classId}`}
                value={correctionReason}
                maxLength={500}
                placeholder="Why is this attendance changing?"
                onChange={(event) => setCorrectionReason(event.target.value)}
              />
              <p className="text-muted-foreground text-xs">
                This class is older than 14 days. The reason is saved in its
                change history.
              </p>
            </div>
          )}
          {!review.reviewed && !canMark && (
            <p className="text-muted-foreground text-sm">
              You can mark attendance for today and the last 14 days. For an
              older class, ask an owner to change it.
            </p>
          )}
          {finish.isError && (
            <p role="alert" className="text-error-text text-sm">
              {finish.error.message}
            </p>
          )}
        </div>
      )}
      {classList.data.corrections.length > 0 && (
        <details className="border-border rounded-lg border p-3">
          <summary
            className={cn(
              "cursor-pointer rounded-sm text-sm font-medium outline-none",
              FOCUS_RING,
            )}
          >
            Change history ({classList.data.corrections.length})
          </summary>
          <ul className="mt-3 flex flex-col gap-3">
            {classList.data.corrections.map((change) => (
              <li key={change.id} className="text-sm">
                <p>{change.reason}</p>
                <p className="text-muted-foreground text-xs">
                  {change.actorName ?? "Former staff member"} ·{" "}
                  {new Date(change.createdAt).toLocaleString()} ·{" "}
                  {change.beforeValue ?? "not recorded"} to{" "}
                  {change.afterValue ?? "cleared"}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="bg-raised sticky top-0 z-10 -mb-2 flex flex-col gap-2 pb-2">
        <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
            {canMark || ended ? (
              <>
                <span className="flex items-center gap-1.5">
                  <MarkDot kind="present" filled />
                  {review.present} present
                </span>
                <span className="flex items-center gap-1.5">
                  <MarkDot kind="absent" filled />
                  {review.absent} absent
                </span>
                {review.unmarked > 0 ? (
                  <span className="text-foreground flex items-center gap-1.5">
                    <MarkDot kind="present" filled={false} />
                    {review.unmarked} to mark
                  </span>
                ) : (
                  review.total > 0 && (
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
              disabled={markAll.isPending || !correctionReady}
              onClick={() =>
                markAll.mutate({
                  id: classId,
                  reason: reasonRequired ? reason : undefined,
                })
              }
            >
              Mark all present
            </Button>
          )}
        </div>
        {canMark && review.total > 0 && (
          <Meter
            role="progressbar"
            max={review.total}
            label={`${review.present + review.absent} of ${review.total} marked`}
            segments={[
              { value: review.present, tone: "success" },
              { value: review.absent, tone: "error" },
            ]}
            glow
            className="h-0.5"
          />
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No members listed.">
          {canMark
            ? "Add any members who attended as walk-ins below."
            : "This class has no member attendance records."}
        </EmptyState>
      ) : (
        <ul className={cn(ROSTER_LIST, "max-h-none overflow-visible")}>
          {rows.map((r) => {
            const present = r.attendanceStatus === "present";
            const absent = r.attendanceStatus === "absent";
            const name = r.name ?? "Member";
            return (
              <li key={r.studentId} className={ROSTER_ROW}>
                <span className="min-w-0 flex-1 truncate text-sm" title={name}>
                  {name}
                </span>
                {!canMark && ended && (
                  <RowTag tone={markTone(present, absent)}>
                    {present ? "present" : absent ? "absent" : "unmarked"}
                  </RowTag>
                )}
                {r.role && isStaffRole({ role: r.role }) && (
                  <RowTag>{r.role}</RowTag>
                )}
                {r.bookingStatus === "none" && <RowTag>walk-in</RowTag>}
                {r.bookingStatus === "booked" &&
                  r.bookingTier === "provisional" && <RowTag>pending</RowTag>}
                {canCancelBookings && r.bookingStatus === "booked" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={cancelFor.isPending}
                    busy={
                      cancelFor.isPending &&
                      cancelFor.variables.personId === r.studentId
                    }
                    aria-label={`Cancel booking for ${name}`}
                    onClick={() =>
                      cancelFor.mutate({ classId, personId: r.studentId })
                    }
                  >
                    Cancel booking
                  </Button>
                )}
                {canMark && (
                  <div
                    role="group"
                    aria-label={`Attendance for ${name}`}
                    className="border-border flex shrink-0 gap-0.5 rounded-md border p-0.5"
                  >
                    <button
                      type="button"
                      disabled={!correctionReady}
                      aria-pressed={present}
                      aria-label={present ? `Clear ${name}` : `${name} present`}
                      className={segmentClass("present", present)}
                      onClick={() =>
                        mark.mutate({
                          classId,
                          personId: r.studentId,
                          status: present ? "unmarked" : "present",
                          reason: reasonRequired ? reason : undefined,
                        })
                      }
                    >
                      <Check aria-hidden className="size-3.5" />
                      <span className="hidden sm:inline">Present</span>
                    </button>
                    <button
                      type="button"
                      disabled={!correctionReady}
                      aria-pressed={absent}
                      aria-label={absent ? `Clear ${name}` : `${name} absent`}
                      className={segmentClass("absent", absent)}
                      onClick={() =>
                        mark.mutate({
                          classId,
                          personId: r.studentId,
                          status: absent ? "unmarked" : "absent",
                          reason: reasonRequired ? reason : undefined,
                        })
                      }
                    >
                      <X aria-hidden className="size-3.5" />
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
          <ul className={cn(ROSTER_LIST, "max-h-none overflow-visible")}>
            {dropIns.map((d) => {
              const present = d.attendanceStatus === "present";
              const absent = d.attendanceStatus === "absent";
              const name = `${d.firstName} ${d.lastName}`.trim();
              return (
                <li key={d.id} className={ROSTER_ROW}>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {name}
                  </span>
                  {!canMark && ended && (
                    <RowTag tone={markTone(present, absent)}>
                      {present ? "present" : absent ? "absent" : "unmarked"}
                    </RowTag>
                  )}
                  {d.bookingStatus === "booked" && (
                    <RowTag tone="info">booked</RowTag>
                  )}
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    {d.phone}
                  </span>
                  {canMark && (
                    <div
                      role="group"
                      aria-label={`Attendance for ${name}`}
                      className="border-border flex shrink-0 gap-0.5 rounded-md border p-0.5"
                    >
                      <button
                        type="button"
                        disabled={!correctionReady}
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
                            reason: reasonRequired ? reason : undefined,
                          })
                        }
                      >
                        <Check aria-hidden className="size-3.5" />
                        <span className="hidden sm:inline">Present</span>
                      </button>
                      <button
                        type="button"
                        disabled={!correctionReady}
                        aria-pressed={absent}
                        aria-label={absent ? `Clear ${name}` : `${name} absent`}
                        className={segmentClass("absent", absent)}
                        onClick={() =>
                          markVisitor.mutate({
                            classId,
                            visitId: d.id,
                            status: absent ? "unmarked" : "absent",
                            reason: reasonRequired ? reason : undefined,
                          })
                        }
                      >
                        <X aria-hidden className="size-3.5" />
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
            <Plus
              aria-hidden
              className="text-muted-foreground size-3.5 transition-transform group-open:rotate-45 motion-reduce:transition-none"
            />
            Add someone who isn&apos;t listed
            <span className="text-muted-foreground ml-auto text-xs font-normal">
              member, staff or visitor
            </span>
          </summary>

          <div className={cn(cardClass(), "mt-2")}>
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">
                Members and staff who didn&apos;t book
              </p>
              {walkInCandidates.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Every active member and staff person is already on this class.
                </p>
              ) : (
                <>
                  <Input
                    type="search"
                    value={walkInQuery}
                    onChange={(e) => setWalkInQuery(e.target.value)}
                    placeholder={`Search ${walkInCandidates.length} people`}
                    aria-label="Search members and staff"
                  />
                  {matchingCandidates.length === 0 ? (
                    <p className="text-muted-foreground py-2 text-sm">
                      No person matches “{walkInQuery}”. Record them as a
                      visitor below.
                    </p>
                  ) : (
                    <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                      {matchingCandidates.map((m) => (
                        <li key={m.id}>
                          <label className="hover:bg-hover flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm transition-colors motion-reduce:transition-none sm:min-h-9">
                            <Checkbox
                              checked={walkInIds.has(m.id)}
                              onCheckedChange={(checked) =>
                                setWalkInIds((prev) => {
                                  const next = new Set(prev);
                                  if (checked === true) next.add(m.id);
                                  else next.delete(m.id);
                                  return next;
                                })
                              }
                            />
                            {m.name}
                            {isStaffRole(m) && <RowTag>{m.role}</RowTag>}
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                  <Button
                    size="sm"
                    className="self-start"
                    busy={addWalkIn.isPending}
                    disabled={
                      walkInIds.size === 0 ||
                      addWalkIn.isPending ||
                      !correctionReady
                    }
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
                addVisitor.mutate({
                  classId,
                  ...visitor,
                  reason: reasonRequired ? reason : undefined,
                });
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
                disabled={
                  addVisitor.isPending || !visitorValid || !correctionReady
                }
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
