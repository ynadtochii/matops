import { useState } from "react";
import { Text, View } from "react-native";
import { Stack as RouterStack, useLocalSearchParams } from "expo-router";

import {
  Button,
  Heading,
  Muted,
  Screen,
  Stack,
  TextField,
  useTheme,
} from "~/components/ui";
import { authClient } from "~/utils/auth";

/**
 * Sign in (spec S1) — a passwordless magic link. Email only for the link; the
 * student's name + phone are captured later in the join flow (S2). The
 * `callbackURL` (a relative path) is turned into the app's `matops://` deep link
 * by @better-auth/expo, so the return bounces back into the app and the auth
 * gate (index) routes onward. `redirect` carries an in-flight invite so the
 * magic-link return lands back on it.
 *
 * Social login (Continue with Google) is **web-only for now** — the mobile
 * browser→app session hand-off isn't landing yet, so mobile uses magic-link
 * only. Deferred to the native idToken flow (ADR 35, docs/mobile-google-login-
 * handoff.md).
 *
 * In development the link prints to the Next.js console (email is Phase 4) — the
 * user copies the `[auth] magic link …` URL and opens it.
 */
export default function SignIn() {
  const t = useTheme();
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSend = email.includes("@") && !pending;
  const callbackURL = redirect?.startsWith("/") ? redirect : "/";

  const send = async () => {
    setPending(true);
    setError(null);
    const res = await authClient.signIn.magicLink({
      email: email.trim(),
      callbackURL,
    });
    setPending(false);
    if (res.error) {
      setError(res.error.message ?? "Could not send the link. Try again.");
      return;
    }
    setSent(true);
  };

  return (
    <Screen center>
      <RouterStack.Screen options={{ title: "Sign in" }} />

      <Stack gap={24}>
        <Stack gap={8}>
          <Heading>Sign in</Heading>
          <Muted>
            We&apos;ll email you a one-tap sign-in link — no password to
            remember.
          </Muted>
        </Stack>

        {sent ? (
          <Stack gap={16}>
            <View
              style={{ gap: 4, backgroundColor: t.muted, borderRadius: 8, padding: 16 }}
            >
              <Text
                style={{ fontSize: 16, fontWeight: "500", color: t.foreground }}
              >
                Check your email
              </Text>
              <Muted>
                Open the sign-in link we sent to {email.trim()}. In development,
                copy the “[auth] magic link …” line from the Next.js terminal and
                open it.
              </Muted>
            </View>
            <Button
              label="Use a different email"
              variant="ghost"
              onPress={() => {
                setSent(false);
                setError(null);
              }}
            />
          </Stack>
        ) : (
          <Stack gap={16}>
            <TextField
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              keyboardType="email-address"
            />
            {error ? (
              <Text style={{ color: t.destructive, fontSize: 14 }}>{error}</Text>
            ) : null}
            <Button
              label={pending ? "Sending…" : "Send magic link"}
              onPress={send}
              disabled={!canSend}
            />
          </Stack>
        )}
      </Stack>
    </Screen>
  );
}
