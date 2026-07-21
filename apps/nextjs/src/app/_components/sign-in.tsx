import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Button } from "@matops/ui/button";
import { Input } from "@matops/ui/input";

import { auth } from "~/auth/server";

/**
 * Passwordless sign-in (spec S1 / owner onboarding A3). Two ways in, per S1:
 * **Continue with Google** (social) or **email + magic link**. The magic link
 * prints to the dev console until email ships (Phase 4). `callbackURL` returns
 * the user to where they started — e.g. an invite/join page. A social sign-in
 * creates a user with no academy membership, so it lands on the same join gate
 * as magic-link (ADR 35).
 *
 * Google is shown only when the server has OAuth creds configured (its
 * `signInSocial` returns no url otherwise); the button no-ops rather than 500s.
 */
export function SignIn({ callbackURL = "/" }: { callbackURL?: string }) {
  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <form>
        <Button
          type="submit"
          variant="outline"
          size="lg"
          className="w-full"
          formAction={async () => {
            "use server";
            const res = await auth.api.signInSocial({
              body: { provider: "google", callbackURL },
              headers: await headers(),
            });
            // `url` is set only when Google creds are configured; redirect to
            // Google's consent screen, which returns to /api/auth/callback/google.
            if (res.url) redirect(res.url);
          }}
        >
          Continue with Google
        </Button>
      </form>

      <div className="flex items-center gap-3">
        <span className="bg-border h-px flex-1" />
        <span className="text-muted-foreground text-xs">or</span>
        <span className="bg-border h-px flex-1" />
      </div>

      <form className="flex flex-col gap-2">
        <Input
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          aria-label="Email"
        />
        <Button
          size="lg"
          formAction={async (formData) => {
            "use server";
            const value = formData.get("email");
            const email = typeof value === "string" ? value : "";
            await auth.api.signInMagicLink({
              body: { email, callbackURL },
              headers: await headers(),
            });
          }}
        >
          Send magic link
        </Button>
      </form>
      <p className="text-muted-foreground text-center text-sm">
        We&apos;ll email you a sign-in link. In development, copy the{" "}
        <code className="text-xs">[auth] magic link …</code> URL from the
        terminal.
      </p>
    </div>
  );
}
