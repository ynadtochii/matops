import { useState } from "react";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Button,
  Heading,
  Loading,
  Muted,
  Screen,
  TextField,
  Txt,
  Stack as UIStack,
} from "~/components/ui";
import { trpc } from "~/utils/api";
import { authClient } from "~/utils/auth";
import { setActiveEntity } from "~/utils/entity-store";

/**
 * Invite landing (spec S2) — the RN twin of the web `join-flow.tsx`. Resolves
 * the token to the academy + intended role (public, works signed-out). A
 * signed-in user fills the minimal profile → a PENDING membership → lands on the
 * schedule with the S3 banner. A signed-out user signs in first, carrying this
 * path so the magic-link return comes back here. Reached via `matops://join/…`.
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
      onSuccess: async (joined) => {
        setActiveEntity(joined.academyId);
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
        <Loading label="Opening your invite" />
      </>
    );
  }

  if (invite.isError) {
    return (
      <Screen center>
        <Stack.Screen options={{ title: "Invite" }} />
        <UIStack gap={16}>
          <UIStack gap={8}>
            <Heading>Invite not valid</Heading>
            <Muted>
              This invite isn&apos;t valid or has expired — ask your gym for a
              new link, or enter their 6-digit ID instead.
            </Muted>
          </UIStack>
          <Button
            label="Enter a gym ID"
            onPress={() => router.replace("/onboarding")}
          />
        </UIStack>
      </Screen>
    );
  }

  const { academyName, role } = invite.data;
  const roleLabel = role === "instructor" ? "an instructor" : "a student";

  return (
    <Screen avoidKeyboard>
      <Stack.Screen options={{ title: "Join" }} />

      <UIStack gap={24}>
        <UIStack gap={8}>
          <Heading>Join {academyName}</Heading>
          <Muted>
            You&apos;re joining as {roleLabel}. Your gym confirms you after you
            join.
          </Muted>
        </UIStack>

        {session ? (
          <UIStack gap={16}>
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
            {error ? (
              <Txt size={14} tone="error">
                {error}
              </Txt>
            ) : null}
            <Button
              label={join.isPending ? "Joining…" : `Join ${academyName}`}
              loading={join.isPending}
              disabled={!firstName.trim() || !lastName.trim() || !phone.trim()}
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
          </UIStack>
        ) : (
          <UIStack gap={12}>
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
          </UIStack>
        )}
      </UIStack>
    </Screen>
  );
}
