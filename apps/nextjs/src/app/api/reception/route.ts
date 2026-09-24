import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod/v4";

import { createTRPCContext } from "@matops/api";
import { resolveReceptionLink } from "@matops/db";

import { auth } from "~/auth/server";
import { env } from "~/env";

/**
 * Exchange the permanent entrance link for a browser cookie (ADR 139).
 *
 * The secret travels in a POST body, never in a request URL, and the page that
 * calls this strips it from the address bar afterwards. The exchange is
 * same-origin only, so another site cannot spend a link it somehow read.
 *
 * A browser that still holds an account session is refused until the person
 * asks for the handover explicitly. Signing somebody out silently, on a device
 * they may be about to carry away, is not ours to decide.
 */

const ExchangeSchema = z.object({
  key: z.string().regex(/^[a-f0-9]{64}$/),
  handover: z.boolean().optional(),
});

const COOKIE_DAYS = 30;
const UNAVAILABLE = "This reception link is not available. Please ask staff.";

function failure(message: string, status: number, extra?: object) {
  return NextResponse.json(
    { error: message, ...extra },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return failure("Open the reception link from this website.", 403);
  }

  const input = ExchangeSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!input.success) return failure(UNAVAILABLE, 400);

  try {
    const context = await createTRPCContext({
      auth,
      headers: request.headers,
    });
    const branch = await resolveReceptionLink(input.data.key, context.baseDb);
    if (!branch) return failure(UNAVAILABLE, 401);

    const session = await auth.api.getSession({
      headers: request.headers,
      query: { disableCookieCache: true },
    });
    if (session && !input.data.handover) {
      return failure("This browser is signed in to a staff account.", 409, {
        needsHandover: true,
      });
    }
    if (session) {
      const signedOut = await auth.api.signOut({ headers: request.headers });
      if (!signedOut.success) {
        return failure("Could not sign this browser out. Try again.", 500);
      }
    }

    const response = NextResponse.json(
      { ok: true, name: branch.name },
      { headers: { "Cache-Control": "no-store" } },
    );
    response.cookies.set("matops-reception", input.data.key, {
      httpOnly: true,
      sameSite: "strict",
      secure: env.NODE_ENV === "production",
      path: "/",
      maxAge: COOKIE_DAYS * 24 * 60 * 60,
    });
    return response;
  } catch (error) {
    Sentry.captureException(error);
    return failure("Could not open reception. Try again.", 500);
  }
}
