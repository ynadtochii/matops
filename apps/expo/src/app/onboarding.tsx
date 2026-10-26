import { useState } from "react";
import { ScrollView } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { SignupAnswerState } from "~/components/signup-questions";
import { EMPTY_ANSWERS, SignupQuestions } from "~/components/signup-questions";
import {
  Button,
  confirm,
  Heading,
  Logo,
  Muted,
  Screen,
  TextField,
  Txt,
  Stack as UIStack,
} from "~/components/ui";
import { trpc } from "~/utils/api";
import { authClient } from "~/utils/auth";
import { setActiveEntity } from "~/utils/entity-store";

const CODE_RE = /^\d{6}$/;

export default function Onboarding() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const another = useLocalSearchParams<{ another?: string }>().another === "1";

  const [code, setCode] = useState("");
  const [query, setQuery] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [answers, setAnswers] = useState<SignupAnswerState>(EMPTY_ANSWERS);
  const [error, setError] = useState<string | null>(null);

  const found = useQuery(
    trpc.academy.findByCode.queryOptions(
      { code: query ?? "" },
      { enabled: query !== null, retry: false },
    ),
  );

  const join = useMutation(
    trpc.membership.joinByCode.mutationOptions({
      onSuccess: async (joined) => {
        setActiveEntity(joined.academyId);
        await queryClient.invalidateQueries();
        router.replace("/");
      },
      onError: (err) => setError(err.message || "Couldn't join. Try again."),
    }),
  );

  const search = () => {
    const trimmed = code.trim();
    if (!CODE_RE.test(trimmed)) {
      setError("Enter your gym's 6-digit join code.");
      return;
    }
    setError(null);
    setQuery(trimmed);
  };

  const reset = () => {
    setQuery(null);
    setError(null);
    setAnswers(EMPTY_ANSWERS);
  };

  const academy = found.data ?? null;
  const errText = (msg: string) => (
    <Txt size={13} tone="error">
      {msg}
    </Txt>
  );

  const codeValid = CODE_RE.test(code.trim());

  const profileFilled =
    !!firstName.trim() && !!lastName.trim() && !!phone.trim();
  const submitReady =
    profileFilled &&
    !!answers.belt &&
    (academy?.waiver ? answers.waiverId === academy.waiver.id : true);

  return (
    <Screen center avoidKeyboard>
      <Stack.Screen
        options={{ title: another ? "Join another gym" : "Join a gym" }}
      />

      <UIStack gap={24}>
        <Logo size={30} />

        {query !== null && academy ? (
          <ScrollView
            contentContainerStyle={{ gap: 24, paddingBottom: 24 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <UIStack key="profile" gap={8}>
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
            </UIStack>

            <SignupQuestions
              academyName={academy.name}
              signupHealthQuestion={academy.signupHealthQuestion}
              waiver={academy.waiver ?? null}
              state={answers}
              onChange={(patch) =>
                setAnswers((prev) => ({ ...prev, ...patch }))
              }
            />

            {error && errText(error)}

            <Button
              label={join.isPending ? "Joining…" : `Join ${academy.name}`}
              loading={join.isPending}
              disabled={!submitReady}
              onPress={() => {
                setError(null);
                join.mutate({
                  code: query,
                  firstName: firstName.trim(),
                  lastName: lastName.trim(),
                  phone: phone.trim(),
                  belt: answers.belt || undefined,
                  stripes: answers.stripes,
                  health: answers.health || undefined,
                  emailUpdates: answers.emailUpdates,
                  waiverId: answers.waiverId ?? undefined,
                });
              }}
            />
            <Button
              label="Use a different ID"
              variant="ghost"
              onPress={reset}
            />
          </ScrollView>
        ) : (
          <UIStack key="code" gap={24}>
            <UIStack gap={8}>
              <Heading>{another ? "Join another gym" : "Join a gym"}</Heading>
              <Muted>
                {another
                  ? "Ask that gym for its 6-digit join code, then enter it here."
                  : "Ask your gym for its 6-digit join code, then enter it here."}
              </Muted>
            </UIStack>

            <UIStack gap={16}>
              <TextField
                label="Join code"
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
              {query !== null &&
                !found.isFetching &&
                !academy &&
                !found.isError &&
                errText(
                  "No gym found with that join code. Check the six digits with your gym.",
                )}
              {found.isError &&
                errText("Couldn't search right now. Try again.")}
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

        {another ? (
          <Button
            label="Cancel"
            variant="ghost"
            onPress={() => router.back()}
          />
        ) : (
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
        )}
      </UIStack>
    </Screen>
  );
}
