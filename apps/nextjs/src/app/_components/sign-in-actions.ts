"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "~/auth/server";

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
    body: { provider: "google", callbackURL },
    headers: await headers(),
  });
  if (res.url) redirect(res.url);
}

export interface MagicLinkState {
  status: "idle" | "sent" | "error";
  email?: string;
}

/** Email magic link. Returns state so the form can confirm "check your email"
 * or surface a failure, instead of resolving silently. */
export async function sendMagicLinkAction(
  callbackURL: string,
  _prev: MagicLinkState,
  formData: FormData,
): Promise<MagicLinkState> {
  const value = formData.get("email");
  const email = typeof value === "string" ? value : "";
  if (!email) return { status: "error" };
  try {
    await auth.api.signInMagicLink({
      body: { email, callbackURL },
      headers: await headers(),
    });
    return { status: "sent", email };
  } catch {
    return { status: "error" };
  }
}
