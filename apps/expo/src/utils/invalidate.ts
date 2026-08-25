import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { Aggregate } from "@matops/domain";
import { invalidatedBy } from "@matops/domain";

export function useInvalidate() {
  const queryClient = useQueryClient();
  return useCallback(
    (aggregate: Aggregate) =>
      Promise.all(
        invalidatedBy(aggregate).map((path) =>
          queryClient.invalidateQueries({ queryKey: [[path]] }),
        ),
      ),
    [queryClient],
  );
}
