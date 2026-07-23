import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Banner,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Heading,
  Loading,
  Mono,
  Muted,
  Screen,
  Stack,
  Txt,
} from "~/components/ui";
import { trpc } from "~/utils/api";
import { timeFmt } from "~/utils/format";

/**
 * Check in (spec S8, slice 3.4). Resolves the academy's current/next class
 * (server-side) and, on one tap, marks the student present — booking the class
 * first if needed, even if it's full. A pending member checks in too
 * (provisional). No camera in v1: uses the active academy directly.
 */
export default function CheckIn() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [doneId, setDoneId] = useState<string | null>(null);

  const today = useQuery(
    trpc.checkin.today.queryOptions(undefined, { retry: false }),
  );

  const checkIn = useMutation(
    trpc.checkin.checkIn.mutationOptions({
      onSuccess: async (_res, vars) => {
        setDoneId(vars.classId);
        await queryClient.invalidateQueries(trpc.class.pathFilter());
        await queryClient.invalidateQueries(trpc.checkin.pathFilter());
      },
      onError: (err) => setError(err.message || "Could not check in"),
    }),
  );

  return (
    <Screen>
      <Stack gap={24}>
        <Heading>Check in</Heading>

        {today.isPending ? (
          <Loading />
        ) : today.isError ? (
          <ErrorState
            label="today's classes"
            onRetry={() => void today.refetch()}
          />
        ) : today.data.length === 0 ? (
          <EmptyState
            title="No class right now."
            body="Come back around class time to check in."
          />
        ) : (
          <Stack gap={16}>
            <Muted>
              {today.data.length === 1
                ? "Confirm your class:"
                : "Which class are you here for?"}
            </Muted>
            {error && (
              <Txt size={14} tone="error">
                {error}
              </Txt>
            )}
            {today.data.map((c) => {
              const done = doneId === c.id;
              return (
                <Card key={c.id} variant="outline" style={{ gap: 12 }}>
                  <Txt size={16} weight={500}>
                    <Mono size={16} weight={600}>
                      {timeFmt.format(new Date(c.startsAt))}
                    </Mono>
                    {`  ${c.title}`}
                  </Txt>
                  {done ? (
                    <Banner tone="success">
                      You&apos;re checked in. See you on the mats.
                    </Banner>
                  ) : (
                    <Button
                      label={checkIn.isPending ? "Checking in…" : "Check in"}
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
          </Stack>
        )}
      </Stack>
    </Screen>
  );
}
