import { useState } from "react";
import { Text, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";

import { Button, Heading, Muted, Screen, TextField } from "~/components/ui";
import { authClient } from "~/utils/auth";

/**
 * Sign in (spec S1) — passwordless magic link. Email only; the student's name +
 * phone are captured later in the join flow (S2). The `callbackURL` (a relative
 * path) is turned into the app's `matops://` deep link by @better-auth/expo, so
 * opening the link bounces back into the app and the auth gate (index) routes
 * onward. When reached from an invite (S2), `redirect` carries the join path so
 * the magic-link return lands back on the invite — the token is not lost.
 *
 * In development the link prints to the Next.js console (email is Phase 4) — the
 * user copies the `[auth] magic link …` URL and opens it.
 */
export default function SignIn() {
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSend = email.includes("@") && !pending;

  const send = async () => {
    setPending(true);
    setError(null);
    const res = await authClient.signIn.magicLink({
      email: email.trim(),
      callbackURL: redirect?.startsWith("/") ? redirect : "/",
    });
    setPending(false);
    if (res.error) {
      setError(res.error.message ?? "Could not send the link. Try again.");
      return;
    }
    setSent(true);
  };

  return (
    <Screen className="justify-center gap-6">
      <Stack.Screen options={{ title: "Sign in" }} />

      <View className="gap-2">
        <Heading>Sign in</Heading>
        <Muted>
          We&apos;ll email you a one-tap sign-in link — no password to remember.
        </Muted>
      </View>

      {sent ? (
        <View className="gap-4">
          <View className="bg-muted gap-1 rounded-md p-4">
            <Text className="text-foreground text-base font-medium">
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
        </View>
      ) : (
        <View className="gap-4">
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
            autoFocus
          />
          {error && <Text className="text-destructive text-sm">{error}</Text>}
          <Button
            label={pending ? "Sending…" : "Send magic link"}
            onPress={send}
            disabled={!canSend}
          />
        </View>
      )}
    </Screen>
  );
}
