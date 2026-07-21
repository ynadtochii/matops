import { notificationsEnv } from "./env";

const RESEND_URL = "https://api.resend.com/emails";

export interface EmailPayload {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

export interface SendEmailResult {
  sent: boolean;
  ok: boolean;
}

/**
 * Send a transactional email via Resend (docs/issues/17). Serverless HTTPS
 * transport. No-op (logged) when RESEND_API_KEY / RESEND_FROM are unset, so
 * dev and unconfigured environments never fail. Never throws.
 */
export async function sendEmail(
  payload: EmailPayload,
): Promise<SendEmailResult> {
  const { RESEND_API_KEY, RESEND_FROM } = notificationsEnv();
  if (!RESEND_API_KEY || !RESEND_FROM) {
    console.warn("[notifications] Resend not configured — email skipped");
    return { sent: false, ok: true };
  }
  const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];
  if (recipients.length === 0) return { sent: false, ok: true };

  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: RESEND_FROM,
        to: recipients,
        subject: payload.subject,
        text: payload.text,
        html: payload.html,
      }),
    });
    if (!res.ok) {
      console.error(`[notifications] Resend HTTP ${res.status}`);
      return { sent: false, ok: false };
    }
    return { sent: true, ok: true };
  } catch (err) {
    console.error("[notifications] Resend failed", err);
    return { sent: false, ok: false };
  }
}
