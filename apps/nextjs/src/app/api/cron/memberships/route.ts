import type { NextRequest } from "next/server";

import { cronVerdict } from "@matops/api/cron-auth";
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
 * NOT SCHEDULED, deliberately, and for the same reason `/api/cron/materialize`
 * is not (ADR 46, 79): booking and admission already enforce the deadline
 * themselves, so a late run costs nobody a wrongly kept place, only a stale
 * booking sitting in a list. Call it by hand:
 *   curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/memberships
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

  const reminded = await runMembershipReminderSweep(db);

  // Page through, so a gym past one batch is not skipped for ever. Capped so
  // one call still ends: a leftover cursor means run it again.
  const cancelled = { checked: 0, blocked: 0, cancelled: 0 };
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const run = await runMembershipCancellationSweep(db, { after });
    cancelled.checked += run.checked;
    cancelled.blocked += run.blocked;
    cancelled.cancelled += run.cancelled;
    if (!run.nextCursor) break;
    after = run.nextCursor;
  }

  return Response.json({ ok: true, reminded, cancelled });
}
