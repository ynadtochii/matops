import { useEffect, useState } from "react";
import { View } from "react-native";
import { Redirect, Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { CheckinSkeleton } from "~/components/skeletons";
import {
  Banner,
  Button,
  Card,
  Heading,
  Loading,
  Mono,
  Muted,
  Screen,
  Txt,
  Stack as UIStack,
} from "~/components/ui";
import { trpc } from "~/utils/api";
import { authClient } from "~/utils/auth";
import { setActiveEntity } from "~/utils/entity-store";
import { timeFmt } from "~/utils/format";

/**
 * QR walk-in check-in (spec S8, redefined in v1.8 slice 4). The gym's physical QR
 * poster points at the public `https://…/checkin/<academyId>` page; a member with
 * the app taps "Open the app" there, which deep-links `matops://checkin/<id>` into
 * this pushed screen. Here we **book + mark attended** for the class happening now
 * — the only surviving check-in path (the in-app Check-in tab was removed).
 *
 * Flow, reusing existing routers only (no back-end change):
 *   - not signed in    → sign in (S1), carrying this path back
 *   - not a member     → clear message (the owner can still mark present, O5)
 *   - no class live     → "No class to check into right now."
 *   - one class         → auto check in
 *   - two+ overlapping  → pick which
 * `checkin.checkIn` is idempotent (already booked → attend, no double-book) and
 * allows a pending member (provisional), so every branch ends in a clear state.
 */
export default function WalkInCheckin() {
  const { academyId } = useLocalSearchParams<{ academyId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: session, isPending: sessionPending } = authClient.useSession();

  const [scoped, setScoped] = useState(false);
  const [notMember, setNotMember] = useState(false);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The poster names the academy, so the app follows it: store the entity, then
  // move the session's organization to the one that owns it. A student who
  // trains at several gyms may be checking in away from their usual mat, and a
  // non-member is refused here (NOT_FOUND) and shown the safety-net message.
  const setActive = useMutation(
    trpc.academy.setActive.mutationOptions({
      onSuccess: async () => {
        // Only ever store an id the server has accepted. A mistyped poster or a
        // QR from a gym the student left would otherwise wedge every later
        // request behind an entity header they cannot use (ADR 124).
        setActiveEntity(academyId);
        await queryClient.invalidateQueries(trpc.checkin.pathFilter());
        setScoped(true);
      },
      onError: () => setNotMember(true),
    }),
  );

  useEffect(() => {
    if (session && academyId && !setActive.isPending && !scoped && !notMember) {
      setActive.mutate({ academyId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, academyId, scoped, notMember]);

  const today = useQuery(
    trpc.checkin.today.queryOptions(undefined, {
      enabled: scoped,
      retry: false,
    }),
  );

  const checkIn = useMutation(
    trpc.checkin.checkIn.mutationOptions({
      onSuccess: async (_res, vars) => {
        setDoneId(vars.classId);
        await queryClient.invalidateQueries(trpc.class.pathFilter());
        await queryClient.invalidateQueries(trpc.booking.pathFilter());
        await queryClient.invalidateQueries(trpc.checkin.pathFilter());
      },
      onError: (err) =>
        setError(err.message || "Couldn't check you in. Try again."),
    }),
  );

  // One live class → check in automatically, so a scan is a single action.
  const only = today.data?.length === 1 ? today.data[0] : undefined;
  useEffect(() => {
    if (scoped && only && !doneId && !checkIn.isPending && !error) {
      checkIn.mutate({ classId: only.id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoped, only, doneId, error]);

  if (sessionPending) return <Loading />;
  if (!session) {
    return (
      <Redirect
        href={{
          pathname: "/sign-in",
          params: { redirect: `/checkin/${academyId}` },
        }}
      />
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: "Check in" }} />
      <UIStack gap={24}>
        <Heading>Check in</Heading>

        {notMember ? (
          <Muted>
            You&apos;re not a member of this gym. Ask the front desk to add you
            They can also mark you present.
          </Muted>
        ) : !scoped || today.isPending ? (
          <CheckinSkeleton />
        ) : today.isError ? (
          <Muted>
            Couldn&apos;t reach this gym. Check your connection and scan again.
          </Muted>
        ) : today.data.length === 0 ? (
          <Muted>No class to check into right now.</Muted>
        ) : (
          <UIStack gap={16}>
            {today.data.length > 1 && !doneId ? (
              <Muted>Which class are you here for?</Muted>
            ) : null}
            {error ? (
              <Txt size={14} tone="error">
                {error}
              </Txt>
            ) : null}
            {today.data.map((c) => {
              const done = doneId === c.id;
              return (
                <Card key={c.id} variant="outline" style={{ gap: 12 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <Mono size={16} weight={600}>
                      {timeFmt.format(new Date(c.startsAt))}
                    </Mono>
                    <Txt size={16} weight={500} style={{ flex: 1 }}>
                      {c.title}
                    </Txt>
                  </View>
                  {done ? (
                    <Banner tone="success">You&apos;re checked in.</Banner>
                  ) : (
                    <Button
                      label={
                        checkIn.isPending && checkIn.variables.classId === c.id
                          ? "Checking in…"
                          : "Check in"
                      }
                      loading={
                        checkIn.isPending && checkIn.variables.classId === c.id
                      }
                      disabled={checkIn.isPending}
                      onPress={() => {
                        setError(null);
                        checkIn.mutate({ classId: c.id });
                      }}
                    />
                  )}
                </Card>
              );
            })}
            {doneId ? (
              <Button
                label="Done"
                variant="outline"
                onPress={() => router.replace("/schedule")}
              />
            ) : null}
          </UIStack>
        )}
      </UIStack>
    </Screen>
  );
}
