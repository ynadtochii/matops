import { useEffect, useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";

import { Button, Heading, Loading, Muted, Screen } from "~/components/ui";
import { authClient } from "~/utils/auth";

/**
 * Magic-link completion (spec S1). Opened via `matops://magic-link?token=…` — the
 * deep link the server logs for mobile sign-in. The app verifies the token from
 * ITS OWN client so the session cookie the verify response sets is stored in the
 * app's SecureStore (the @better-auth/expo client captures set-cookie on
 * success). This is why mobile can't just open the web verify URL in Safari — the
 * cookie would land in the browser, not the app.
 */
export default function MagicLink() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const router = useRouter();
  const [verifyError, setVerifyError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void authClient.magicLink.verify({ query: { token } }).then((res) => {
      if (cancelled) return;
      if (res.error) {
        setVerifyError(
          res.error.message ?? "This sign-in link is invalid or expired.",
        );
        return;
      }
      // Session is now stored; the gate (index) routes to schedule / join.
      router.replace("/");
    });
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  const error = !token ? "This sign-in link is missing its token." : verifyError;

  if (error) {
    return (
      <Screen className="justify-center gap-4">
        <Stack.Screen options={{ title: "Sign in" }} />
        <Heading>Couldn't sign you in</Heading>
        <Muted>{error} Request a fresh link and try again.</Muted>
        <Button label="Back to sign in" onPress={() => router.replace("/sign-in")} />
      </Screen>
    );
  }

  return (
    <Screen className="justify-center">
      <Stack.Screen options={{ title: "Signing in…" }} />
      <Loading />
    </Screen>
  );
}
