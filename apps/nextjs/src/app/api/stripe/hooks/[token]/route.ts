import * as Sentry from "@sentry/nextjs";

import { cardPaymentWebhookResponse } from "@matops/api/card-payment";
import { parseSecretKeys } from "@matops/api/secret-box";

import { env } from "~/env";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  return cardPaymentWebhookResponse(request, token, {
    secretKeys: parseSecretKeys(
      env.PAYMENT_HOOK_KEY,
      env.PAYMENT_HOOK_KEY_PREVIOUS,
    ),
    requireLive: env.VERCEL_ENV === "production",
    report: (err, context) => {
      console.error("[stripe] card payment webhook failed", err);
      Sentry.captureException(err, { extra: context });
    },
  });
}
