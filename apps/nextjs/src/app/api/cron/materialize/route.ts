import type { NextRequest } from "next/server";

import { runMaterializationSweep } from "@matops/db";

import { env } from "~/env";

/**
 * Daily class materialization cron (docs/issues/16, architecture §7/§9).
 *
 * A system job, NOT a request handler: it runs cross-academy on the base DB
 * connection (the trusted service role, OUTSIDE the tenant seam) and extends
 * every active template's concrete classes to the rolling horizon. Bounded per
 * run (row limit + soft time budget) so it never approaches the serverless
 * duration ceiling; leftovers resume on the next tick.
 *
 * v1 runs NO scheduler (ADR 46) — this route is a dormant seam, not wired to any
 * cron. The schedule stays filled by lazy-on-save materialization (6-week horizon);
 * this endpoint exists to re-extend the horizon cross-academy when a host scheduler
 * is re-attached post-v1 (or via a manual authenticated call meanwhile).
 *
 * Protected by CRON_SECRET when set: a caller sends `Authorization: Bearer <secret>`.
 * CRON_SECRET is optional now; if unset, the route still refuses to run in production.
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

  const result = await runMaterializationSweep();
  return Response.json({ ok: true, ...result });
}
