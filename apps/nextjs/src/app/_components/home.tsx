"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";
import { Dashboard } from "./dashboard";
import { Onboarding } from "./onboarding";
import { ErrorState, SkeletonRows } from "./states";

/** Signed-in home: routes between onboarding and the academy dashboard. */
export function Home() {
  const trpc = useTRPC();
  const current = useQuery(trpc.academy.current.queryOptions());
  const mine = useQuery(trpc.academy.listMine.queryOptions());

  if (current.isPending || mine.isPending) {
    return <SkeletonRows rows={4} />;
  }

  // A failed load must NOT fall through to onboarding (that would look like the
  // user has no academy). Say it failed and let them retry.
  if (current.isError || mine.isError) {
    return (
      <ErrorState
        label="your academy"
        onRetry={() => {
          void current.refetch();
          void mine.refetch();
        }}
      />
    );
  }

  const academies = mine.data.map((a) => ({
    academyId: a.academyId,
    name: a.name,
  }));

  if (!current.data) {
    return <Onboarding academies={academies} />;
  }

  return <Dashboard current={current.data} academies={academies} />;
}
