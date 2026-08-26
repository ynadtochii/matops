export interface CronRequest {
  authorization: string | null;
  secret: string | undefined;
  isProduction: boolean;
}

export type CronVerdict =
  { ok: true } | { ok: false; status: 401 | 500; message: string };

export function cronVerdict(req: CronRequest): CronVerdict {
  if (req.secret) {
    return req.authorization === `Bearer ${req.secret}`
      ? { ok: true }
      : { ok: false, status: 401, message: "Unauthorized" };
  }
  if (req.isProduction) {
    return {
      ok: false,
      status: 500,
      message: "CRON_SECRET is not configured",
    };
  }
  return { ok: true };
}
