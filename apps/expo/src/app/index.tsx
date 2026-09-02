import { useEffect } from "react";
import { Redirect, Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { ErrorState, Loading, Screen } from "~/components/ui";
import { trpc } from "~/utils/api";
import { authClient } from "~/utils/auth";
import { getActiveEntity, setActiveEntity } from "~/utils/entity-store";

/**
 * Auth gate (the student shell entry). Routes on session + active academy:
 *   - no session               → Sign in (S1)
 *   - session, no active gym    → Join a gym (S2 empty state / paste invite)
 *   - session, active gym       → Schedule (S4, the home)
 * A pending member still has an active academy, so they land on the schedule
 * and see the S3 pending banner there — no waiting wall (spec S3).
 */
export default function Index() {
  const { data: session, isPending: sessionPending } = authClient.useSession();

  // A fresh install has no stored academy, and nothing answers for one that was
  // never named (ADR 124). So pick the student's first academy, remember it,
  // and only then ask about it.
  const stored = getActiveEntity();
  const mine = useQuery(
    trpc.academy.listMineStudent.queryOptions(undefined, {
      enabled: !!session && stored === null,
    }),
  );
  const firstAcademy = mine.data?.[0]?.academyId ?? null;
  const entityId = stored ?? firstAcademy;
  useEffect(() => {
    if (firstAcademy) setActiveEntity(firstAcademy);
  }, [firstAcademy]);

  const current = useQuery(
    trpc.academy.current.queryOptions(undefined, {
      enabled: !!session && entityId !== null,
    }),
  );

  const target = () => {
    if (sessionPending) return <Loading />;
    if (!session) return <Redirect href="/sign-in" />;
    if (entityId === null && mine.isPending) {
      return <Loading label="Finding your academy" />;
    }
    if (entityId === null && (mine.data?.length ?? 0) === 0) {
      return <Redirect href="/onboarding" />;
    }
    if (current.isPending) return <Loading label="Opening your academy" />;
    // A failed load is NOT "no gym" — retry instead of dumping a member who
    // already belongs somewhere into the join screen.
    if (current.isError) {
      return (
        <Screen center>
          <ErrorState
            label="your account"
            onRetry={() => void current.refetch()}
          />
        </Screen>
      );
    }
    if (!current.data) return <Redirect href="/onboarding" />;
    return <Redirect href="/schedule" />;
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      {target()}
    </>
  );
}
