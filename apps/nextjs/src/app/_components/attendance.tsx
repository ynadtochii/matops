"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import { Button } from "@matops/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@matops/ui/dialog";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Select } from "@matops/ui/select";

import { useTRPC } from "~/trpc/react";
import { ClassRoster, ROSTER_DIALOG } from "./class-roster";
import { useEntity } from "./entity";
import { LIST } from "./primitives";
import { ScreenSkeleton } from "./skeletons";
import { EmptyState, ErrorState } from "./states";

type ReviewClass = RouterOutputs["attendance"]["reviewQueue"]["rows"][number];

function reviewLabel(review: ReviewClass["review"]) {
  if (review.reviewed) {
    return review.present === 0 ? "Nobody attended, confirmed" : "Reviewed";
  }
  if (review.total === 0) return "Empty roster, needs review";
  if (review.unmarked === review.total) return "Not started";
  if (review.unmarked > 0) return `${review.unmarked} people unmarked`;
  return "Ready to finish";
}

export function Attendance() {
  const trpc = useTRPC();
  const academy = useEntity();
  const [status, setStatus] = useState<"needs_review" | "all">("needs_review");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<ReviewClass | null>(null);
  const validDates = !from || !to || from <= to;
  const classes = useQuery({
    ...trpc.attendance.reviewQueue.queryOptions({
      status,
      from: from || undefined,
      to: to || undefined,
      offset,
    }),
    enabled: validDates,
    refetchInterval: 60_000,
  });
  const format = new Intl.DateTimeFormat(undefined, {
    timeZone: classes.data?.timeZone ?? academy.timeZone ?? undefined,
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <section className="flex flex-col gap-5">
      <p className="text-muted-foreground text-sm">
        {academy.name} · Times in{" "}
        {classes.data?.timeZone ?? academy.timeZone ?? "the branch time zone"}.
        Switch branches using the branch picker.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="attendance-status">Show</Label>
          <Select
            id="attendance-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value === "all" ? "all" : "needs_review");
              setOffset(0);
            }}
          >
            <option value="needs_review">Needs review</option>
            <option value="all">All past classes</option>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="attendance-from">From</Label>
          <Input
            id="attendance-from"
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setOffset(0);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="attendance-to">To</Label>
          <Input
            id="attendance-to"
            type="date"
            value={to}
            aria-invalid={!validDates}
            aria-describedby={!validDates ? "attendance-date-error" : undefined}
            onChange={(event) => {
              setTo(event.target.value);
              setOffset(0);
            }}
          />
        </div>
      </div>
      {!validDates ? (
        <p
          id="attendance-date-error"
          role="alert"
          className="text-error-text text-sm"
        >
          Choose an end date on or after the start date.
        </p>
      ) : classes.isPending ? (
        <ScreenSkeleton />
      ) : classes.isError ? (
        <ErrorState
          label="attendance reviews"
          onRetry={() => void classes.refetch()}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p role="status" className="text-sm font-medium">
              {classes.data.needsReview === 0
                ? "All past classes reviewed"
                : `${classes.data.needsReview} ${classes.data.needsReview === 1 ? "class needs" : "classes need"} attendance review`}
            </p>
            {(from || to) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFrom("");
                  setTo("");
                  setOffset(0);
                }}
              >
                Clear dates
              </Button>
            )}
          </div>
          {classes.data.rows.length === 0 ? (
            <EmptyState
              title={
                offset > 0
                  ? "No more classes on this page."
                  : "No classes to show."
              }
            >
              {from || to
                ? "Try another date range or clear the dates."
                : "Use All past classes to see reviewed attendance. New classes appear here after they end."}
            </EmptyState>
          ) : (
            <ul className={LIST}>
              {classes.data.rows.map((cls) => (
                <li
                  key={cls.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-muted-foreground text-xs tabular-nums">
                      {format.format(new Date(cls.startsAt))}
                    </p>
                    <p className="text-md font-medium break-words">
                      {cls.title}
                    </p>
                    <p className="text-muted-foreground text-sm">
                      {cls.instructorName ?? "No coach assigned"}
                    </p>
                    <p className="text-foreground-secondary text-sm">
                      {reviewLabel(cls.review)}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`${cls.review.reviewed ? "View" : "Review"} ${cls.title}, ${format.format(new Date(cls.startsAt))}`}
                    onClick={() => setSelected(cls)}
                  >
                    {cls.review.reviewed ? "View" : "Review attendance"}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {(offset > 0 ||
            offset + classes.data.rows.length < classes.data.total) && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                variant="outline"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 50))}
              >
                Previous
              </Button>
              <p className="text-muted-foreground text-sm tabular-nums">
                Page {Math.floor(offset / 50) + 1} · {classes.data.total}{" "}
                classes
              </p>
              <Button
                variant="outline"
                disabled={offset + 50 >= classes.data.total}
                onClick={() => setOffset(offset + 50)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent {...ROSTER_DIALOG}>
          {selected && (
            <>
              <DialogTitle>{selected.title}</DialogTitle>
              <DialogDescription>
                {format.format(new Date(selected.startsAt))} ·{" "}
                {selected.durationMinutes} min
              </DialogDescription>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
                <ClassRoster
                  key={selected.id}
                  cls={selected}
                  expectedRows={selected.review.total}
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
