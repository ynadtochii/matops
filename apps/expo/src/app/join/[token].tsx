import { useState } from "react";
import { ScrollView } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { SignupAnswerState } from "~/components/signup-questions";
import { emptyAnswers, SignupQuestions } from "~/components/signup-questions";
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

function canSubmitAnswers(
  role: string,
  answers: SignupAnswerState,
  waiver: { id: string } | null,
): boolean {
  if (role !== "student") return true;
  if (!answers.belt) return false;
  if (waiver && answers.waiverId !== waiver.id) return false;
  return true;
}

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
  const [answers, setAnswers] = useState<SignupAnswerState>(emptyAnswers());
  const [error, setError] = useState<string | null>(null);

  const join = useMutation(
    trpc.membership.join.mutationOptions({
      onSuccess: async (joined) => {
        setActiveEntity(joined.academyId);
        await queryClient.invalidateQueries();
        router.replace("/");
      },
      onError: (err) => setError(err.message || "Couldn't join. Try again."),
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
              This invite isn&apos;t valid or has expired. Ask your gym for a
              new link, or enter their 6-digit join code instead.
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

  const { academyName, role, signupHealthQuestion, waiver } = invite.data;
  const roleLabel = role === "instructor" ? "an instructor" : "a student";
  const showQuestions = role === "student";
  const answerBlock = showQuestions
    ? {
        belt: answers.belt || undefined,
        stripes: answers.stripes,
        health: answers.health || undefined,
        emailUpdates: answers.emailUpdates,
        waiverId: answers.waiverId ?? undefined,
      }
    : {};

  const profileFilled =
    !!firstName.trim() && !!lastName.trim() && !!phone.trim();
  const submitReady =
    profileFilled && canSubmitAnswers(role, answers, waiver ?? null);

  return (
    <Screen avoidKeyboard>
      <Stack.Screen options={{ title: "Join" }} />
      <ScrollView
        contentContainerStyle={{ gap: 24, paddingBottom: 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <UIStack gap={8}>
          <Heading>Join {academyName}</Heading>
          <Muted>
            You&apos;re joining as {roleLabel}. Your gym confirms you after you
            join.
          </Muted>
        </UIStack>

        {session ? (
          <>
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
            </UIStack>

            {showQuestions ? (
              <SignupQuestions
                academyName={academyName}
                signupHealthQuestion={signupHealthQuestion}
                waiver={waiver ?? null}
                state={answers}
                onChange={(patch) =>
                  setAnswers((prev) => ({ ...prev, ...patch }))
                }
              />
            ) : null}

            {error ? (
              <Txt size={13} tone="error">
                {error}
              </Txt>
            ) : null}

            <Button
              label={join.isPending ? "Joining…" : `Join ${academyName}`}
              loading={join.isPending}
              disabled={!submitReady}
              onPress={() => {
                setError(null);
                join.mutate({
                  token,
                  firstName: firstName.trim(),
                  lastName: lastName.trim(),
                  phone: phone.trim(),
                  ...answerBlock,
                });
              }}
            />
          </>
        ) : (
          <UIStack gap={12}>
            <Muted>Sign in to join. It takes one tap.</Muted>
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
      </ScrollView>
    </Screen>
  );
}
