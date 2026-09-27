"use client";

import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { disciplineHue } from "@matops/domain";

import { useTRPC } from "~/trpc/react";

export function useDisciplineHue() {
  const trpc = useTRPC();
  const list = useQuery(trpc.discipline.list.queryOptions());
  const names = useMemo(
    () => (list.data ?? []).map((d) => d.name),
    [list.data],
  );
  const hueOf = useCallback(
    (discipline: string | null) => disciplineHue(discipline, names),
    [names],
  );
  return { names, hueOf };
}
