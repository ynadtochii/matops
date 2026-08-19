import { useEffect, useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";

import {
  Button,
  Heading,
  Loading,
  Muted,
  Screen,
  Stack as UIStack,
} from "~/components/ui";
import { queryClient } from "~/utils/api";
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
  const [slow, setSlow] = useState(false);

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
      // Drop anything the previous user of this device left cached first —
      // query keys carry no user id.
      queryClient.clear();
      router.replace("/");
    });
    return () => {
      cancelled = true;
    };
  }, [token, router]);

  // Failsafe: if verify hasn't resolved after a few seconds, offer an escape so
  // the student is never stranded on a spinner.
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 8000);
    return () => clearTimeout(timer);
  }, []);

  const error = !token
    ? "This sign-in link is missing its token."
    : verifyError;

  if (error) {
    return (
      <Screen center>
        <Stack.Screen options={{ title: "Sign in" }} />
        <UIStack gap={16}>
          <Heading>Couldn&apos;t sign you in</Heading>
          <Muted>{error} Request a fresh link and try again.</Muted>
          <Button
            label="Back to sign in"
            onPress={() => router.replace("/sign-in")}
          />
        </UIStack>
      </Screen>
    );
  }

  if (slow) {
    return (
      <Screen center>
        <Stack.Screen options={{ title: "Signing in…" }} />
        <UIStack gap={16}>
          <Heading>Signing you in…</Heading>
          <Muted>
            This is taking longer than usual. If nothing happens, request a
            fresh link.
          </Muted>
          <Button
            label="Back to sign in"
            variant="outline"
            onPress={() => router.replace("/sign-in")}
          />
        </UIStack>
      </Screen>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: "Signing in…" }} />
      <Loading />
    </>
  );
}
