"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { formatMoney } from "@matops/domain";
import { cn } from "@matops/ui";
import { Button } from "@matops/ui/button";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";
import { useOrganization } from "../entity";
import { DueDateDialog } from "../payment-dates";
import { LIST, SectionHeading } from "../primitives";
import { SkeletonRows } from "../skeletons";
import { EmptyState, ErrorState } from "../states";

/**
 * Each membership's current period, with a tick against each (ADR 126, ADR
 * 163). Periods roll from each member's own payment day.
 *
 * The same record the member profile ticks, read the other way round. An owner
 * confirming payments works from a bank statement in one pass, so the list is
 * the whole gym rather than one branch, and the unpaid ones come first because
 * they are the only rows anybody has to act on.
 *
 * A month nobody has ticked is unpaid. There is no third state, so the button
 * says what it will do rather than asking a question.
 */
export function MonthsTab() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const board = useQuery(trpc.accessPlan.monthBoard.queryOptions());
  const isGymOwner = useOrganization().role === "owner";
  const [moving, setMoving] = useState<string | null>(null);
  const mark = useMutation(
    trpc.accessPlan.markMonth.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.accessPlan.pathFilter());
        await queryClient.invalidateQueries(
          trpc.stats.navigationSummary.pathFilter(),
        );
      },
      onError: (e) =>
        toast.error(e.message || "Couldn't record that. Try again."),
    }),
  );

  if (board.isPending) return <SkeletonRows rows={3} inList />;
  if (board.isError) {
    return (
      <ErrorState
        label="current periods"
        onRetry={() => void board.refetch()}
      />
    );
  }

  const rows = [...board.data.rows].sort((a, b) =>
    a.paid === b.paid ? a.name.localeCompare(b.name) : a.paid ? 1 : -1,
  );

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <SectionHeading
        action={
          <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {rows.filter((r) => r.paymentRequired && r.paid).length} of{" "}
            {rows.filter((r) => r.paymentRequired).length} paid
            {rows.some((r) => !r.paymentRequired) &&
              ` · ${rows.filter((r) => !r.paymentRequired).length} free`}
            {board.data.unpriced > 0 &&
              ` · ${board.data.unpriced} with no price`}
          </span>
        }
      >
        Current periods
      </SectionHeading>

      {rows.length === 0 ? (
        <EmptyState title="Nobody holds a membership yet.">
          Students choose a plan from Membership, or staff assign one on a
          student's profile.
        </EmptyState>
      ) : (
        <ul className={LIST}>
          {rows.map((r) => (
            <li
              key={r.assignmentId}
              className="flex min-h-11 flex-wrap items-center gap-3 px-4 py-3"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate font-medium">{r.name}</span>
                <span className="text-muted-foreground truncate text-sm tabular-nums">
                  {r.planName} · {r.periodLabel}
                  {r.amount
                    ? ` · ${formatMoney(r.amount.priceMinor, r.amount.currency)}`
                    : " · no price yet"}
                </span>
                {r.paid && r.paidUntilLabel && (
                  <span className="text-muted-foreground text-xs">
                    Paid through {r.paidUntilLabel}
                  </span>
                )}
                {!r.paid && r.paymentRequired && (
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      r.overdue ? "text-error-text" : "text-muted-foreground",
                    )}
                  >
                    {r.overdue
                      ? `Blocked since ${r.deadlineLabel}`
                      : `Until ${r.deadlineLabel}`}
                    {r.deadlineMoved ? " (date changed)" : ""}
                  </span>
                )}
              </div>
              {isGymOwner && r.paymentRequired && r.dueDates.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setMoving(r.assignmentId)}
                >
                  Due date
                </Button>
              )}
              {!r.paymentRequired ? (
                <span className="text-muted-foreground text-sm">
                  No payment required
                </span>
              ) : (
                <Button
                  size="sm"
                  variant={r.paid ? "outline" : "primary"}
                  busy={
                    mark.isPending &&
                    mark.variables.assignmentId === r.assignmentId
                  }
                  onClick={() =>
                    mark.mutate({
                      assignmentId: r.assignmentId,
                      month: r.month,
                      paid: !r.paid,
                    })
                  }
                >
                  {r.paid ? "Undo paid" : "Mark paid"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {moving &&
        rows
          .filter((r) => r.assignmentId === moving)
          .map((r) => (
            <DueDateDialog
              key={r.assignmentId}
              held={{
                id: r.assignmentId,
                planName: `${r.name}, ${r.planName}`,
                periods: r.dueDates,
              }}
              onOpenChange={(open) => !open && setMoving(null)}
            />
          ))}
    </section>
  );
}
