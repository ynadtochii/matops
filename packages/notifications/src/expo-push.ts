import { notificationsEnv } from "./env";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK_SIZE = 100; // Expo accepts up to 100 messages per request.

/** A push payload (the domain builds title/body; `data` carries deep-link hints). */
export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface SendPushResult {
  /** Messages actually POSTed (0 when no tokens or unconfigured). */
  sent: number;
  ok: boolean;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

/**
 * Send one push payload to many Expo push tokens (docs/issues/17, 34). Pure
 * serverless transport — a batched HTTPS POST to the Expo Push API, which fans
 * out to APNs/FCM. Never throws: transport failures are logged and swallowed so
 * a notification can never break the mutation that triggered it. Recipient
 * resolution (userIds → tokens) happens upstream in the API layer.
 */
export async function sendPush(
  tokens: string[],
  payload: PushPayload,
): Promise<SendPushResult> {
  const valid = tokens.filter((t) => t.startsWith("ExponentPushToken"));
  if (valid.length === 0) return { sent: 0, ok: true };

  const { EXPO_ACCESS_TOKEN } = notificationsEnv();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${EXPO_ACCESS_TOKEN}`;

  let ok = true;
  let sent = 0;
  for (const batch of chunk(valid, CHUNK_SIZE)) {
    const messages = batch.map((to) => ({
      to,
      title: payload.title,
      body: payload.body,
      data: payload.data,
      sound: "default",
    }));
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(messages),
      });
      if (!res.ok) {
        ok = false;
        console.error(`[notifications] Expo push HTTP ${res.status}`);
      } else {
        sent += batch.length;
      }
    } catch (err) {
      ok = false;
      console.error("[notifications] Expo push failed", err);
    }
  }
  return { sent, ok };
}
