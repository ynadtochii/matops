import { Redirect, Stack } from "expo-router";
import { useQuery } from "@tanstack/react-query";

import { ErrorState, Loading, Screen } from "~/components/ui";
import { trpc } from "~/utils/api";
import { authClient } from "~/utils/auth";
import {
  clearActiveEntity,
  getActiveEntity,
  setActiveEntity,
} from "~/utils/entity-store";

/**
 * Remember which mat the student is on, and answer with it.
 *
 * The stored id is a preference INSIDE the student's own list, never the list
 * itself: a phone remembering a mat they were removed from falls back to one
 * they still train at, rather than to the join screen (ADR 124). The write is
 * synchronous and happens here, where the id is chosen, so the entity header
 * exists before any screen this gate redirects to can ask for it. Nothing
 * depends on the order the hooks are declared in.
 */
function pickEntity(academies: { academyId: string }[]): string | null {
  const stored = getActiveEntity();
  const chosen =
    academies.find((a) => a.academyId === stored)?.academyId ??
    academies[0]?.academyId ??
    null;
  if (chosen === stored) return chosen;
  if (chosen) setActiveEntity(chosen);
  else void clearActiveEntity();
  return chosen;
}

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
  const mine = useQuery(
    trpc.academy.listMineStudent.queryOptions(undefined, {
      enabled: !!session,
    }),
  );

  const target = () => {
    if (sessionPending) return <Loading />;
    if (!session) return <Redirect href="/sign-in" />;
    // A failed load is NOT "no gym" — retry instead of dumping a member who
    // already belongs somewhere into the join screen.
    if (mine.isError) {
      return (
        <Screen center>
          <ErrorState
            label="your account"
            onRetry={() => void mine.refetch()}
          />
        </Screen>
      );
    }
    if (!mine.data) return <Loading label="Finding your gym" />;
    if (!pickEntity(mine.data)) return <Redirect href="/onboarding" />;
    return <Redirect href="/schedule" />;
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      {target()}
    </>
  );
}
