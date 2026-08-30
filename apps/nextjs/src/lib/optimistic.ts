import type { DataTag, QueryClient, QueryKey } from "@tanstack/react-query";

export interface Rollback<TData> {
  key: QueryKey;
  prev: TData | undefined;
}

/**
 * Write the expected result into the cache before the server answers, and hand
 * back what `rollback` needs if it refuses. Cancelling the in-flight queries
 * first is the step that is easy to leave out: without it a refetch already on
 * the wire lands after this write and silently undoes it.
 */
export async function optimistic<TData, TError>(
  queryClient: QueryClient,
  key: DataTag<QueryKey, TData, TError>,
  update: (current: TData) => TData,
): Promise<Rollback<TData>> {
  await queryClient.cancelQueries({ queryKey: key });
  const prev = queryClient.getQueryData(key);
  if (prev !== undefined) queryClient.setQueryData(key, update(prev));
  return { key, prev };
}

export function rollback<TData>(
  queryClient: QueryClient,
  ctx: Rollback<TData> | undefined,
): void {
  if (ctx) queryClient.setQueryData(ctx.key, ctx.prev);
}
