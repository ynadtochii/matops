import type { NextRequest } from "next/server";

import { cronVerdict } from "@matops/api/cron-auth";
import { runReminderSweep } from "@matops/api/notify";
import { db } from "@matops/db/client";

import { env } from "~/env";

/**
 * Reminder cron (docs/issues/17, 40, 75). A system job like the materialization
 * cron: it runs cross-academy on the base DB connection (the trusted service
 * role, OUTSIDE the tenant seam) and does two sweeps, each idempotent + bounded:
 *   - DUES reminders (v1.3 R.1): claim members due-soon / overdue not yet
 *     reminded this period (`dues_reminder_period`) and push them.
 *     This is the sweep the daily schedule exists for (ADR 75).
 *   - CLASS reminders (Phase 4): claim classes whose reminder is due
 *     (`reminder_sent_at`) and push booked students. DISABLED here: the phone
 *     app schedules those on the device (ADR 54) and a daily tick would catch
 *     only the random classes inside the 2h lead window. `leadMinutes: 0` makes
 *     the claim window empty (`startsAt > now AND startsAt <= now`), so no class
 *     is claimed and none is stamped, so re-enabling later loses nothing.
 *
 * Scheduled daily by `.github/workflows/cron.yml` (ADR 75), not by the host, so
 * nothing here is Vercel-specific. Also callable by hand:
 *   curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/remind
 *
 * Protected by CRON_SECRET when set, exactly like the materialize route.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const verdict = cronVerdict({
    authorization: req.headers.get("authorization"),
    secret: env.CRON_SECRET,
    isProduction: env.NODE_ENV === "production",
  });
  if (!verdict.ok) {
    return new Response(verdict.message, { status: verdict.status });
  }

  const result = await runReminderSweep(db, { leadMinutes: 0 });
  // `ok` is the workflow's health check, not the HTTP status: a 5xx here would be
  // retried by curl, and the retry finds every row already claimed and reports a
  // clean run, which hides the very loss this reports.
  return Response.json({ ok: true, ...result });
}
