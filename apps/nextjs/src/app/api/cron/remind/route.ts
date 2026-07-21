import type { NextRequest } from "next/server";

import { runReminderSweep } from "@matops/api/notify";

import { env } from "~/env";

/**
 * Class-reminder cron (docs/issues/17, Phase 4). A system job like the
 * materialization cron: it runs cross-academy on the base DB connection (the
 * trusted service role, OUTSIDE the tenant seam), claims every class whose
 * reminder is due (idempotent via `reminder_sent_at`), and pushes each class's
 * booked students. Bounded per run so it never approaches the serverless limit.
 *
 * The CODE ships in Phase 4; the frequent SCHEDULE that fires it (~every 15 min
 * — needs a sub-daily cron / Vercel Pro) is deferred to Phase 5, so there is no
 * `crons` entry in vercel.json yet. Until then it is exercised by a manual call:
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
