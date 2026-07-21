"use client";

import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";
import { Dashboard } from "./dashboard";
import { Onboarding } from "./onboarding";

/** Signed-in home: routes between onboarding and the academy dashboard. */
export function Home() {
  const trpc = useTRPC();
  const current = useQuery(trpc.academy.current.queryOptions());
  const mine = useQuery(trpc.academy.listMine.queryOptions());

  if (current.isPending || mine.isPending) {
    return <p className="text-muted-foreground text-sm">Loading…</p>;
  }

  const academies = (mine.data ?? []).map((a) => ({
    academyId: a.academyId,
    name: a.name,
  }));

  if (!current.data) {
    return <Onboarding academies={academies} />;
  }

  return <Dashboard current={current.data} academies={academies} />;
}
