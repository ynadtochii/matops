import { useState } from "react";
import { Text, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Button,
  Heading,
  Loading,
  Muted,
  Screen,
  TextField,
} from "~/components/ui";
import { trpc } from "~/utils/api";
import { authClient } from "~/utils/auth";

/**
 * Invite landing (spec S2) — the RN twin of the web `join-flow.tsx`. Resolves
 * the token to the academy + intended role (public, works signed-out). A
 * signed-in user fills the minimal profile → a PENDING membership → lands on the
 * schedule with the S3 banner (no waiting wall). A signed-out user is sent to
 * sign in first, carrying this path so the magic-link return comes back here.
 * Reached via the `matops://join/<token>` deep link or the in-app paste path.
 */
export default function JoinScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();

  const invite = useQuery(
    trpc.invite.resolve.queryOptions({ token }, { retry: false }),
  );

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  const join = useMutation(
    trpc.membership.join.mutationOptions({
      onSuccess: async () => {
        // Refresh the gate's inputs so index routes to the schedule, not back
        // to onboarding, on the now-active (pending) academy.
        await queryClient.invalidateQueries();
        router.replace("/");
      },
      onError: (err) => setError(err.message || "Could not join"),
    }),
  );

  if (invite.isPending) {
    return (
      <>
        <Stack.Screen options={{ title: "Join" }} />
        <Loading />
      </>
    );
  }

  if (invite.isError) {
    return (
      <Screen className="justify-center gap-3">
        <Stack.Screen options={{ title: "Invite" }} />
        <Heading>Invite not valid</Heading>
        <Muted>
          This invite isn&apos;t valid — ask your gym for a new link.
        </Muted>
      </Screen>
    );
  }

  const { academyName, role } = invite.data;
  const roleLabel = role === "instructor" ? "an instructor" : "a student";

  return (
    <Screen className="gap-6">
      <Stack.Screen options={{ title: "Join" }} />

      <View className="gap-2">
        <Heading>Join {academyName}</Heading>
        <Muted>
          You&apos;re joining as {roleLabel}. Your gym confirms you after you
          join.
        </Muted>
      </View>

      {session ? (
        <View className="gap-4">
          <TextField
            label="First name"
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words"
          />
          <TextField
            label="Last name"
            value={lastName}
            onChangeText={setLastName}
            autoCapitalize="words"
          />
          <TextField
            label="Phone"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />
          {error && <Text className="text-destructive text-sm">{error}</Text>}
          <Button
            label={join.isPending ? "Joining…" : `Join ${academyName}`}
            disabled={
              join.isPending ||
              !firstName.trim() ||
              !lastName.trim() ||
              !phone.trim()
            }
            onPress={() => {
              setError(null);
              join.mutate({
                token,
                firstName: firstName.trim(),
                lastName: lastName.trim(),
                phone: phone.trim(),
              });
            }}
          />
        </View>
      ) : (
        <View className="gap-3">
          <Muted>Sign in to join — it takes one tap.</Muted>
          <Button
            label="Sign in to join"
            onPress={() =>
              router.push({
                pathname: "/sign-in",
                params: { redirect: `/join/${token}` },
              })
            }
          />
        </View>
      )}
    </Screen>
  );
}
