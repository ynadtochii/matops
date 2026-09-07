import type { NextRequest } from "next/server";

import { cronVerdict } from "@matops/api/cron-auth";
import { runRecordedJob } from "@matops/api/job-run";
import { runMaterializationSweep } from "@matops/db";
import { db } from "@matops/db/client";

import { env } from "~/env";

/**
 * Daily class materialization cron (docs/issues/16, 75, architecture §7/§9).
 *
 * A system job, NOT a request handler: it runs cross-academy on the base DB
 * connection (the trusted service role, OUTSIDE the tenant seam) and extends
 * every active template's concrete classes to the rolling horizon. Bounded per
 * run (row limit + soft time budget) so it never approaches the serverless
 * duration ceiling; leftovers resume on the next tick.
 *
 * Protected by CRON_SECRET when set: a caller sends `Authorization: Bearer <secret>`.
 * CRON_SECRET is optional now; if unset, the route still refuses to run in production.
 */
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

  const result = await runRecordedJob(
    db,
    "calendar_materialization",
    () => runMaterializationSweep({ exec: db }),
    {
      succeeded: (run) => !run.hasMore,
      failureMessage: () => "Calendar materialization has more work",
    },
  );
  return Response.json({ ok: true, ...result });
}
