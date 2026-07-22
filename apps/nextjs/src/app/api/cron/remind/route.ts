import type { NextRequest } from "next/server";

import { runReminderSweep } from "@matops/api/notify";

import { env } from "~/env";

/**
 * Reminder cron (docs/issues/17, 40). A system job like the materialization
 * cron: it runs cross-academy on the base DB connection (the trusted service
 * role, OUTSIDE the tenant seam) and does two sweeps, each idempotent + bounded:
 *   - CLASS reminders (Phase 4) — claim classes whose reminder is due
 *     (`reminder_sent_at`) and push booked students.
 *   - DUES reminders (v1.3 R.1) — claim members due-soon / overdue not yet
 *     reminded this period (`dues_reminder_period`) and push + email them.
 *
 * This route now runs DAILY (vercel.json `crons`) — enough for dues. The
 * *frequent* (~15 min) cadence that class reminders really want still needs a
 * sub-daily cron / Vercel Pro and stays a Phase-5 concern. Also callable by hand:
 *   curl -H "Authorization: Bearer $CRON_SECRET" .../api/cron/remind
 *
 * Protected by CRON_SECRET, exactly like the materialize route.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authorized = req.headers.get("authorization");
  if (env.CRON_SECRET) {
    if (authorized !== `Bearer ${env.CRON_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  } else if (env.NODE_ENV === "production") {
    // Refuse to run unprotected in production.
    return new Response("CRON_SECRET is not configured", { status: 500 });
  }

  const result = await runReminderSweep();
  return Response.json({ ok: true, ...result });
}
