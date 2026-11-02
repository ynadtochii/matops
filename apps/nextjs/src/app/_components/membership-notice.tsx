"use client";

import { useQuery } from "@tanstack/react-query";

import { formatMoney } from "@matops/domain";

import { useTRPC } from "~/trpc/react";
import { cardClass, Eyebrow } from "./primitives";

/**
 * The plan waiting for the 1st (ADR 129).
 *
 * A member should read what they will be on and what it costs before the month
 * turns, rather than find out from an amount that changed. Nothing here is a
 * warning: this month is unaffected and there is nothing to pay early.
 */
export function MembershipChangeNotice() {
  const trpc = useTRPC();
  const standing = useQuery(trpc.accessPlan.mine.queryOptions());
  const changing = (standing.data?.memberships ?? []).filter((m) => m.next);
  if (changing.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {changing.map((m) => (
        <div key={m.assignmentId} className={cardClass()}>
          <Eyebrow>Your plan changes</Eyebrow>
          <p className="mt-1 text-sm">
            {m.planName} runs to the end of this month. {m.next?.planName}{" "}
            starts on 1 {m.next?.effectiveMonthLabel}
            {m.next?.amount
              ? ` at ${formatMoney(m.next.amount.priceMinor, m.next.amount.currency)} a month`
              : ""}
            .
          </p>
        </div>
      ))}
    </div>
  );
}
