import type { NextRequest } from "next/server";

import { cronVerdict } from "@matops/api/cron-auth";
import { runRecordedJob } from "@matops/api/job-run";
import { runNotificationOutbox } from "@matops/db";
import { db } from "@matops/db/client";
import { sendEmail } from "@matops/notifications";

import { env } from "~/env";

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
    "notification_delivery",
    () => runNotificationOutbox(db, sendEmail),
    {
      succeeded: (run) => run.failed === 0,
      failureMessage: (run) => `${run.failed} email deliveries failed`,
    },
  );
  return Response.json({ ok: result.failed === 0, ...result });
}
