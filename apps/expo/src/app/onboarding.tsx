import { useState } from "react";
import { Stack, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Button,
  confirm,
  Heading,
  InlineLoading,
  Logo,
  Muted,
  Screen,
  TextField,
  Txt,
  Stack as UIStack,
} from "~/components/ui";
import { trpc } from "~/utils/api";
import { authClient } from "~/utils/auth";

/** Exactly six digits — matches AcademyCodeSchema / isValidAcademyCode. */
const CODE_RE = /^\d{6}$/;

/**
 * "Join a gym" (spec S2, docs/issues/32) — shown when a signed-in user has no
 * active academy. Mobile v1 is a plain code lookup: the student types the gym's
 * 6-digit ID → we find the academy → they confirm + fill the minimal profile →
 * a PENDING membership → they land on the schedule with the S3 banner.
 */
export default function Onboarding() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [code, setCode] = useState("");
  const [query, setQuery] = useState<string | null>(null);

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
  const errText = (msg: string) => (
    <Txt size={14} tone="error">
      {msg}
    </Txt>
  );

  const codeValid = CODE_RE.test(code.trim());

  return (
    <Screen center avoidKeyboard>
      <Stack.Screen options={{ title: "Join a gym" }} />

      <UIStack gap={24}>
        <Logo size={30} />

        {query !== null && academy ? (
          /* Phase 2 — a gym was found: confirm + fill the profile. */
          <UIStack key="profile" gap={24}>
            <UIStack gap={8}>
              <Heading>Join {academy.name}</Heading>
              {academy.address ? <Muted>{academy.address}</Muted> : null}
              <Muted>Your gym confirms you after you join.</Muted>
            </UIStack>

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
              {error && errText(error)}
              <Button
                label={join.isPending ? "Joining…" : `Join ${academy.name}`}
                loading={join.isPending}
                disabled={
                  !firstName.trim() || !lastName.trim() || !phone.trim()
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
            </UIStack>
          </UIStack>
        ) : (
          /* Phase 1 — enter the gym's ID. */
          <UIStack key="code" gap={24}>
            <UIStack gap={8}>
              <Heading>Join a gym</Heading>
              <Muted>
                Ask your gym for its ID — a 6-digit number — and enter it here.
              </Muted>
            </UIStack>

            <UIStack gap={16}>
              <TextField
                label="Gym ID"
                value={code}
                onChangeText={(next) => {
                  setCode(next.replace(/\D/g, ""));
                  if (query !== null) reset();
                }}
                placeholder="482913"
                keyboardType="phone-pad"
                autoCapitalize="none"
                maxLength={6}
              />
              {query !== null && found.isFetching && <InlineLoading />}
              {query !== null &&
                !found.isFetching &&
                !academy &&
                !found.isError &&
                errText(
                  "No gym found with that ID — check the number with your gym.",
                )}
              {found.isError &&
                errText("Could not search right now — try again.")}
              {error && errText(error)}
              <Button
                label="Find gym"
                onPress={search}
                loading={found.isFetching}
                disabled={!codeValid || found.isFetching}
              />
            </UIStack>
          </UIStack>
        )}

        <Button
          label="Sign out"
          variant="ghost"
          onPress={() =>
            confirm({
              title: "Sign out?",
              message: "You'll need your email sign-in link to get back in.",
              confirmLabel: "Sign out",
              onConfirm: () => {
                void authClient.signOut();
                router.replace("/");
              },
            })
          }
        />
      </UIStack>
    </Screen>
  );
}
