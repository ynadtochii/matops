import { Redirect, Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { Loading } from "~/components/ui";
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
    if (current.isPending) return <Loading />;
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
