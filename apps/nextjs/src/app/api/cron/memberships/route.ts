import type { NextRequest } from "next/server";

import { cronVerdict } from "@matops/api/cron-auth";
import { runRecordedJob } from "@matops/api/job-run";
import {
  runMembershipCancellationSweep,
  runMembershipReminderSweep,
} from "@matops/api/membership-sweep";
import { db } from "@matops/db/client";

import { env } from "~/env";

/**
 * Membership sweeps (ADR 126). Cross-organization on the base DB connection,
 * outside the tenant seam, like the other two cron seams. Two passes:
 *   - WARN the members whose month is unpaid but still inside grace, once each,
 *     claimed through `membership_month.reminded_at` so nobody is told twice.
 *   - CANCEL the future bookings of the ones already past it.
 * Warning runs first, so somebody who crosses the deadline between the two has
 * been told before their classes go.
 *
 * Safe to run again. The sweep re-reads the payment inside the transaction that
 * cancels, and only rows still `booked` are changed, so a retry finds nothing
 * to do and releases no place twice.
 */
export const maxDuration = 60;

const MAX_PAGES = 20;

export async function GET(req: NextRequest) {
  const verdict = cronVerdict({
    authorization: req.headers.get("authorization"),
    secret: env.CRON_SECRET,
    isProduction: env.NODE_ENV === "production",
  });
  if (!verdict.ok) {
    return new Response(verdict.message, { status: verdict.status });
  }
  const initialAfter = req.nextUrl.searchParams.get("after") ?? undefined;

  const result = await runRecordedJob(
    db,
    "membership_sweep",
    async () => {
      const reminded = { checked: 0, sent: 0 };
      let reminderAfter = initialAfter;
      for (let page = 0; page < MAX_PAGES; page++) {
        const run = await runMembershipReminderSweep(db, {
          after: reminderAfter,
        });
        reminded.checked += run.checked;
        reminded.sent += run.sent;
        reminderAfter = run.nextCursor ?? undefined;
        if (!reminderAfter) break;
      }

      const cancelled = { checked: 0, blocked: 0, cancelled: 0 };
      let cancellationAfter = initialAfter;
      for (let page = 0; page < MAX_PAGES; page++) {
        const run = await runMembershipCancellationSweep(db, {
          after: cancellationAfter,
        });
        cancelled.checked += run.checked;
        cancelled.blocked += run.blocked;
        cancelled.cancelled += run.cancelled;
        cancellationAfter = run.nextCursor ?? undefined;
        if (!cancellationAfter) break;
      }

      return {
        reminded,
        cancelled,
        hasMore: Boolean(reminderAfter ?? cancellationAfter),
        nextCursor: reminderAfter ?? cancellationAfter ?? null,
      };
    },
    {
      succeeded: (run) => !run.hasMore,
      failureMessage: () => "Membership sweep has more work",
    },
  );

  return Response.json({ ok: true, ...result });
}
