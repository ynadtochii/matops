const MINUTE_MS = 60_000;

export const DEFAULT_STALE_MS = 30_000;

const BY_NAMESPACE: Record<string, number> = {
  academy: 5 * MINUTE_MS,
  template: 5 * MINUTE_MS,
  rank: 5 * MINUTE_MS,
  invite: 5 * MINUTE_MS,
  stats: 2 * MINUTE_MS,
};

const BY_PATH: Record<string, number> = {
  "payments.plans": 5 * MINUTE_MS,
  "payments.planOptions": 5 * MINUTE_MS,
  "payments.getRequisites": 5 * MINUTE_MS,
  "notification.unreadCount": MINUTE_MS,
  "payments.claims": MINUTE_MS,
};

export function staleTimeMs(path: string): number {
  const byPath = BY_PATH[path];
  if (byPath !== undefined) return byPath;

  const namespace = path.split(".")[0] ?? "";
  return BY_NAMESPACE[namespace] ?? DEFAULT_STALE_MS;
}

export function staleTimeForQueryKey(queryKey: readonly unknown[]): number {
  const path = queryKey[0];
  if (!Array.isArray(path) || !path.every((s) => typeof s === "string")) {
    return DEFAULT_STALE_MS;
  }
  return staleTimeMs(path.join("."));
}
