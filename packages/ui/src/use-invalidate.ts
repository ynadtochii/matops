import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

const AFFECTS = {
  booking: ["class", "booking", "stats"],
  attendance: ["class", "attendance", "stats"],
  payment: ["payments", "membership", "stats"],
  membership: ["membership", "stats"],
  schedule: ["class", "template", "booking", "stats"],
} as const;

type Aggregate = keyof typeof AFFECTS;

export function useInvalidate() {
  const queryClient = useQueryClient();
  return useCallback(
    (aggregate: Aggregate) =>
      Promise.all(
        AFFECTS[aggregate].map((path) =>
          queryClient.invalidateQueries({ queryKey: [[path]] }),
        ),
      ),
    [queryClient],
  );
}
