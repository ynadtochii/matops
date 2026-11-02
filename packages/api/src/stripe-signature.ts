import { createHmac, timingSafeEqual } from "node:crypto";

export interface StripeWebhookEvent {
  id: string;
  type: string;
  livemode: boolean;
  object: Record<string, unknown>;
}

const TOLERANCE_SECONDS = 300;

export class StripeSignatureError extends Error {
  constructor(message: string) {
    super(`[stripe] ${message}`);
    this.name = "StripeSignatureError";
  }
}

export function signStripePayload(
  secret: string,
  rawBody: string,
  timestamp: number,
): string {
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

export function verifyStripeEvent(
  secret: string,
  rawBody: string,
  header: string | null,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): StripeWebhookEvent {
  if (!header) throw new StripeSignatureError("missing signature header");
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key === "t" && value) timestamp = Number(value);
    if (key === "v1" && value) signatures.push(value);
  }
  if (timestamp === null || !Number.isFinite(timestamp)) {
    throw new StripeSignatureError("signature has no timestamp");
  }
  if (Math.abs(nowSeconds - timestamp) > TOLERANCE_SECONDS) {
    throw new StripeSignatureError("signature timestamp is too old");
  }
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest();
  const matches = signatures.some((s) => {
    const given = Buffer.from(s, "hex");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
  if (!matches) throw new StripeSignatureError("signature does not match");

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new StripeSignatureError("body is not JSON");
  }
  const event = parsed as {
    id?: unknown;
    type?: unknown;
    livemode?: unknown;
    data?: { object?: unknown };
  };
  if (
    typeof event.id !== "string" ||
    typeof event.type !== "string" ||
    typeof event.livemode !== "boolean" ||
    typeof event.data?.object !== "object" ||
    event.data.object === null
  ) {
    throw new StripeSignatureError("body is not a Stripe event");
  }
  return {
    id: event.id,
    type: event.type,
    livemode: event.livemode,
    object: event.data.object as Record<string, unknown>,
  };
}
