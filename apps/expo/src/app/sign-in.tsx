import { useState } from "react";
import { View } from "react-native";
import { Stack as RouterStack, useLocalSearchParams } from "expo-router";

import {
  Blueprint,
  Button,
  Card,
  Heading,
  Logo,
  Mark,
  Muted,
  Screen,
  Stack,
  TextField,
  Title,
  Txt,
} from "~/components/ui";
import { authClient } from "~/utils/auth";

/**
 * Sign in (spec S1) — a passwordless magic link. Email only; name + phone are
 * captured later in the join flow (S2). The `callbackURL` becomes the app's
 * `matops://` deep link via @better-auth/expo, so the return bounces into the
 * app and the auth gate routes onward. `redirect` carries an in-flight invite.
 *
 * This is the app's branded front door: a whisper-quiet blueprint grid and an
 * oversized bled-off mark behind the form (the mobile twin of the web sign-in).
 */
export default function SignIn() {
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
    try {
      const res = await authClient.signIn.magicLink({
        email: email.trim(),
        callbackURL,
      });
      if (res.error) {
        setError(res.error.message ?? "Could not send the link. Try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Could not send the link. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Screen center avoidKeyboard>
      <RouterStack.Screen options={{ title: "Sign in" }} />

      {/* Signature backdrop — grid + a bled-off mark, behind the form. */}
      <Blueprint opacity={0.5} />
      <View
        pointerEvents="none"
        style={{ position: "absolute", top: -56, right: -56, opacity: 0.08 }}
      >
        <Mark size={300} />
      </View>

      <Stack gap={24}>
        <Logo size={32} />
        <Stack gap={8}>
          <Heading>Run the mat.</Heading>
          <Muted>
            We&apos;ll email you a one-tap sign-in link — no password to
            remember.
          </Muted>
        </Stack>

        {sent ? (
          <Stack gap={16}>
            <Card variant="outline" style={{ gap: 4 }}>
              <Title>Check your email</Title>
              <Muted>
                Open the sign-in link we sent to {email.trim()}. The link expires
                soon — if it doesn&apos;t arrive, resend it.
                {__DEV__
                  ? " In development, copy the “[auth] magic link …” line from the Next.js terminal and open it."
                  : ""}
              </Muted>
            </Card>
            {error ? (
              <Txt size={14} tone="error">
                {error}
              </Txt>
            ) : null}
            <Button
              label={pending ? "Resending…" : "Resend link"}
              variant="outline"
              loading={pending}
              onPress={send}
            />
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
              <Txt size={14} tone="error">
                {error}
              </Txt>
            ) : null}
            <Button
              label={pending ? "Sending…" : "Send magic link"}
              onPress={send}
              loading={pending}
              disabled={!canSend}
            />
          </Stack>
        )}
      </Stack>
    </Screen>
  );
}
