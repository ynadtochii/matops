import { useState } from "react";
import { Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";

import { Button, Heading, Muted, Screen, TextField } from "~/components/ui";
import { authClient } from "~/utils/auth";
import { extractInviteToken } from "~/utils/invite";

/**
 * "Join a gym" empty state (spec S2) — shown when a signed-in user has no active
 * academy. The primary path is opening the gym's `matops://join/<code>` deep
 * link; this screen also lets the user paste that link (or a bare code) if the
 * deep link didn't fire (e.g. testing in a client that owns its own scheme).
 */
export default function Onboarding() {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);

  const open = () => {
    const token = extractInviteToken(raw);
    if (!token) {
      setError("Paste your gym's invite link or code.");
      return;
    }
    setError(null);
    router.push({ pathname: "/join/[token]", params: { token } });
  };

  return (
    <Screen className="justify-center gap-6">
      <Stack.Screen options={{ title: "Join a gym" }} />

      <View className="gap-2">
        <Heading>Join a gym</Heading>
        <Muted>
          Open your gym&apos;s invite link to join. Got the link as text? Paste
          it here.
        </Muted>
      </View>

      <View className="gap-4">
        <TextField
          label="Invite link or code"
          value={raw}
          onChangeText={setRaw}
          placeholder="matops://join/…"
          autoCapitalize="none"
        />
        {error && <Text className="text-destructive text-sm">{error}</Text>}
        <Button
          label="Continue"
          onPress={open}
          disabled={raw.trim().length === 0}
        />
      </View>

      <Button
        label="Sign out"
        variant="ghost"
        onPress={() => {
          void authClient.signOut();
          router.replace("/");
        }}
      />
    </Screen>
  );
}
