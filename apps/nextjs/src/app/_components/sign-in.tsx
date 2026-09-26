"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@matops/ui/button";

import type { MagicLinkState } from "./sign-in-actions";
import { env } from "~/env";
import { EmailField } from "./form-fields";
import { sendMagicLinkAction, signInSocialAction } from "./sign-in-actions";

/**
 * Passwordless sign-in (spec S1 / owner onboarding A3). Two ways in, per S1:
 * **Continue with Google** (social) or **email + magic link**. The magic link
 * is delivered via Resend; in local dev (no Resend creds needed) it also
 * prints to the console, so the idle-state copy only mentions that fallback
 * when `NODE_ENV === "development"`. `callbackURL` returns the user to where
 * they started — e.g. an invite/join page. A social sign-in creates a user
 * with no academy membership, so it lands on the same join gate (ADR 35).
 *
 * Both buttons show a pending state (`useFormStatus`) so a submit can't be
 * fired twice and the user sees it working; the magic-link form confirms "check
 * your email" via `useActionState` instead of resolving silently.
 */

/** A submit button that shows a spinner + disables while its form is pending. */
export function SubmitButton({
  children,
  variant,
  className,
}: {
  children: React.ReactNode;
  variant?: "primary" | "outline";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="lg"
      variant={variant}
      className={className}
      disabled={pending}
      busy={pending}
    >
      {children}
    </Button>
  );
}

export function SocialSignIn({ callbackURL }: { callbackURL: string }) {
  return (
    <form action={signInSocialAction.bind(null, callbackURL)}>
      <SubmitButton variant="outline" className="w-full">
        Continue with Google
      </SubmitButton>
    </form>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3">
      <span className="bg-border h-px flex-1" />
      <span className="text-muted-foreground text-xs">or</span>
      <span className="bg-border h-px flex-1" />
    </div>
  );
}

export function SignIn({ callbackURL = "/" }: { callbackURL?: string }) {
  const [email, setEmail] = useState("");
  const [state, formAction] = useActionState<MagicLinkState, FormData>(
    sendMagicLinkAction.bind(null, callbackURL),
    { status: "idle" },
  );

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <SocialSignIn callbackURL={callbackURL} />
      <OrDivider />

      <form action={formAction} className="flex flex-col gap-2">
        <EmailField
          name="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          required
          invalid={state.status === "error"}
        />
        <SubmitButton className="w-full">Send magic link</SubmitButton>
      </form>

      <p
        aria-live="polite"
        className="text-muted-foreground text-sm text-pretty"
      >
        {state.status === "sent" ? (
          <span className="text-foreground font-medium">
            Check your email. We sent a sign-in link to {state.email}.
          </span>
        ) : state.status === "error" ? (
          <span className="text-error-text">
            Couldn&apos;t send the link. Check the address and try again.
          </span>
        ) : env.NODE_ENV === "development" ? (
          <>
            We&apos;ll email you a sign-in link. In development, copy the{" "}
            <code className="font-mono text-xs">[auth] magic link …</code> URL
            from the terminal.
          </>
        ) : (
          "We'll email you a sign-in link."
        )}
      </p>
    </div>
  );
}
