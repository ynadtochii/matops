import { useState } from "react";
import { Text, View } from "react-native";
import { Stack, useRouter } from "expo-router";
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

/** Exactly six digits — matches AcademyCodeSchema / isValidAcademyCode. */
const CODE_RE = /^\d{6}$/;

/**
 * "Join a gym" (spec S2, docs/issues/32) — shown when a signed-in user has no
 * active academy. Mobile v1 is a plain code lookup: the student types the gym's
 * 6-digit ID → we find the academy → they confirm + fill the minimal profile →
 * a PENDING membership → they land on the schedule with the S3 banner. Deep
 * links / per-role invite links return in a later iteration.
 */
export default function Onboarding() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Phase 1: the code the user is typing, and the one we've submitted to search.
  const [code, setCode] = useState("");
  const [query, setQuery] = useState<string | null>(null);

  // Phase 2: the minimal profile, filled once a gym is found.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  const found = useQuery(
    trpc.academy.findByCode.queryOptions(
      { code: query ?? "" },
      { enabled: query !== null, retry: false },
    ),
  );

  const join = useMutation(
    trpc.membership.joinByCode.mutationOptions({
      onSuccess: async () => {
        // Refresh the gate's inputs so index routes to the schedule (now-active,
        // pending), not back to onboarding.
        await queryClient.invalidateQueries();
        router.replace("/");
      },
      onError: (err) => setError(err.message || "Could not join"),
    }),
  );

  const search = () => {
    const trimmed = code.trim();
    if (!CODE_RE.test(trimmed)) {
      setError("Enter your gym's 6-digit ID.");
      return;
    }
    setError(null);
    setQuery(trimmed);
  };

  const reset = () => {
    setQuery(null);
    setError(null);
  };

  const academy = found.data ?? null;

  return (
    <Screen className="justify-center gap-6">
      <Stack.Screen options={{ title: "Join a gym" }} />

      {/* Phase 2 — a gym was found: confirm + fill the profile. */}
      {query !== null && academy ? (
        <>
          <View className="gap-2">
            <Heading>Join {academy.name}</Heading>
            <Muted>Your gym confirms you after you join.</Muted>
          </View>

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
              label={join.isPending ? "Joining…" : `Join ${academy.name}`}
              disabled={
                join.isPending ||
                !firstName.trim() ||
                !lastName.trim() ||
                !phone.trim()
              }
              onPress={() => {
                setError(null);
                join.mutate({
                  code: query,
                  firstName: firstName.trim(),
                  lastName: lastName.trim(),
                  phone: phone.trim(),
                });
              }}
            />
            <Button
              label="Use a different ID"
              variant="ghost"
              onPress={reset}
            />
          </View>
        </>
      ) : (
        /* Phase 1 — enter the gym's ID. */
        <>
          <View className="gap-2">
            <Heading>Join a gym</Heading>
            <Muted>
              Ask your gym for its ID — a 6-digit number — and enter it here.
            </Muted>
          </View>

          <View className="gap-4">
            <TextField
              label="Gym ID"
              value={code}
              onChangeText={(t) => {
                setCode(t);
                if (query !== null) reset();
              }}
              placeholder="482913"
              keyboardType="phone-pad"
              autoCapitalize="none"
            />
            {query !== null && found.isFetching && <Loading />}
            {query !== null &&
              !found.isFetching &&
              !academy &&
              !found.isError && (
                <Text className="text-destructive text-sm">
                  No gym found with that ID — check the number with your gym.
                </Text>
              )}
            {found.isError && (
              <Text className="text-destructive text-sm">
                Could not search right now — try again.
              </Text>
            )}
            {error && <Text className="text-destructive text-sm">{error}</Text>}
            <Button
              label="Find gym"
              onPress={search}
              disabled={code.trim().length === 0 || found.isFetching}
            />
          </View>
        </>
      )}

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
