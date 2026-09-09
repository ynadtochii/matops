import { notificationsEnv } from "./env";

const RESEND_URL = "https://api.resend.com/emails";

interface EmailPayload {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
  idempotencyKey?: string;
}

interface SendEmailResult {
  sent: boolean;
  ok: boolean;
  outcome: "accepted" | "not_configured" | "timeout" | "rejected" | "failed";
  providerId?: string;
  errorCode?: string;
}

/**
 * Send a transactional email via Resend (docs/issues/17). Serverless HTTPS
 * transport. No-op (logged) when RESEND_API_KEY / RESEND_FROM are unset, so
 * dev and unconfigured environments never fail. Never throws.
 */
export async function sendEmail(
  payload: EmailPayload,
  options: { timeoutMs?: number; fetch?: typeof fetch } = {},
): Promise<SendEmailResult> {
  const { RESEND_API_KEY, RESEND_FROM } = notificationsEnv();
  if (!RESEND_API_KEY || !RESEND_FROM) {
    console.warn("[notifications] Resend not configured — email skipped");
    return { sent: false, ok: true, outcome: "not_configured" };
  }
  const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];
  if (recipients.length === 0) {
    return { sent: false, ok: true, outcome: "not_configured" };
  }

  try {
    const res = await (options.fetch ?? fetch)(RESEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
        ...(payload.idempotencyKey
          ? { "Idempotency-Key": payload.idempotencyKey }
          : {}),
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: recipients,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
      }),
      signal: AbortSignal.timeout(options.timeoutMs ?? 5_000),
    });
    if (!res.ok) {
      console.error(`[notifications] Resend HTTP ${res.status}`);
      return {
        sent: false,
        ok: false,
        outcome: "rejected",
        errorCode: `http_${res.status}`,
      };
    }
    const body = (await res.json().catch(() => null)) as { id?: string } | null;
    return {
      sent: true,
      ok: true,
      outcome: "accepted",
      ...(body?.id ? { providerId: body.id } : {}),
    };
  } catch (err) {
    console.error("[notifications] Resend failed", err);
    const timeout = err instanceof Error && err.name === "TimeoutError";
    return {
      sent: false,
      ok: false,
      outcome: timeout ? "timeout" : "failed",
      errorCode: timeout ? "transport_timeout" : "transport_failed",
    };
  }
}
