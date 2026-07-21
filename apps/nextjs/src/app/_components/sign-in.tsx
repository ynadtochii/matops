import { headers } from "next/headers";

import { Button } from "@matops/ui/button";
import { Input } from "@matops/ui/input";

import { auth } from "~/auth/server";

/**
 * Passwordless sign-in (spec S1 / owner onboarding A3). The magic link prints to
 * the dev console until email ships (Phase 4). `callbackURL` returns the user to
 * where they started — e.g. an invite/join page.
 */
export function SignIn({ callbackURL = "/" }: { callbackURL?: string }) {
  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
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
