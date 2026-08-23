import { Redirect, Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { ErrorState, Loading, Screen } from "~/components/ui";
import { trpc } from "~/utils/api";
import { authClient } from "~/utils/auth";

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

  const current = useQuery(
    trpc.academy.current.queryOptions(undefined, {
      enabled: !!session,
    }),
  );

  const target = () => {
    if (sessionPending) return <Loading />;
    if (!session) return <Redirect href="/sign-in" />;
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
