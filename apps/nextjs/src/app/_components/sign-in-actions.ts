"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod/v4";

import { EmailSchema, NameSchema, PhoneSchema } from "@matops/validators";

import { auth } from "~/auth/server";

/**
 * A server action is a public endpoint — anything bound on the client can be
 * posted directly with any value. So every field is re-validated here with the
 * same schemas the tRPC boundary uses, and the return path is pinned to a
 * same-site relative path: `//evil.com` and `https://evil.com` both read as a
 * URL to a browser, so an unchecked `callbackURL` is an open redirect that also
 * lands attacker text inside the sign-in email we send.
 */
function safeCallbackURL(raw: string): string {
  return /^\/(?!\/)[\w\-./?=&%~+:@]*$/.test(raw) && raw.length <= 512
    ? raw
    : "/";
}

/**
 * Server actions for the sign-in form (spec S1). Split out of `sign-in.tsx` so
 * that file can be a client component (`useActionState` / `useFormStatus` give
 * the buttons their pending + success feedback). `callbackURL` is bound on the
 * client, so both actions receive it as their first argument.
 */

/** Google OAuth. Redirects to Google's consent screen when creds are set; the
 * button no-ops otherwise (S1 / ADR 35). */
export async function signInSocialAction(
  callbackURL: string,
  _formData?: FormData,
): Promise<void> {
  const res = await auth.api.signInSocial({
    body: { provider: "google", callbackURL: safeCallbackURL(callbackURL) },
    headers: await headers(),
  });
  if (res.url) redirect(res.url);
}

const JoinLinkSchema = z.object({
  email: EmailSchema,
  firstName: NameSchema,
  lastName: NameSchema,
  phone: PhoneSchema,
});

export interface MagicLinkState {
  status: "idle" | "sent" | "error";
  email?: string;
}

/**
 * The profile rides in the `callbackURL` rather than in client storage: the
 * emailed link is often opened in a different browser than the form was typed
 * in, where nothing client-side survives.
 */
export async function sendJoinLinkAction(
  token: string,
  _prev: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const read = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const parsed = JoinLinkSchema.safeParse({
    email: read("email"),
    firstName: read("firstName"),
    lastName: read("lastName"),
    phone: read("phone"),
  });
  if (!parsed.success) return { status: "error" };
  const { email, ...profile } = parsed.data;

  // base64url, not query pairs: better-auth decodes the callbackURL a second
  // time on verify, which turns a phone's `%2B` into `+` and then into a space.
  const carried = Buffer.from(JSON.stringify(profile)).toString("base64url");
  try {
    await auth.api.signInMagicLink({
      body: {
        email,
        callbackURL: safeCallbackURL(
          `/join/${encodeURIComponent(token)}?p=${carried}`,
        ),
      },
      headers: await headers(),
    });
    return { status: "sent", email };
  } catch (err) {
    // The caller only ever sees "error", so without this the sign-in path
    // fails silently and we lose the user with no signal.
    Sentry.captureException(err, { tags: { action: "sendJoinLink" } });
    return { status: "error" };
  }
}

/** Email magic link. Returns state so the form can confirm "check your email"
 * or surface a failure, instead of resolving silently. */
export async function sendMagicLinkAction(
  callbackURL: string,
  _prev: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const value = formData.get("email");
  const parsed = EmailSchema.safeParse(typeof value === "string" ? value : "");
  if (!parsed.success) return { status: "error" };
  const email = parsed.data;
  try {
    await auth.api.signInMagicLink({
      body: { email, callbackURL: safeCallbackURL(callbackURL) },
      headers: await headers(),
    });
    return { status: "sent", email };
  } catch (err) {
    Sentry.captureException(err, { tags: { action: "sendMagicLink" } });
    return { status: "error" };
  }
}
