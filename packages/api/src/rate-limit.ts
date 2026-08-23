/**
 * Fixed-window rate limiting for the unauthenticated surface (ADR 46 follow-up).
 *
 * The join QR goes on a public wall, so `dropIn.submit` is a stranger-writable
 * insert. State is per process: on Vercel Fluid compute a scaled-out instance
 * gets its own counters and a cold start resets them, so this is a flood brake,
 * not a global ceiling. Upgrade path is a `rate_limit` table if a gym ever needs
 * a real one.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export const MAX_KEYS = 5_000;

export function take(
  key: string,
  max: number,
  windowMs: number,
  now: number = Date.now(),
): boolean {
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_KEYS) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
      // A flood from rotating IPs leaves every bucket live, so sweeping expiries
      // frees nothing and the map would grow without a ceiling. Forgetting the
      // whole window is fine here: this is a brake, not an accounting record.
      if (buckets.size >= MAX_KEYS) buckets.clear();
    }
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (bucket.count >= max) return false;
  bucket.count += 1;
  return true;
}

export function resetRateLimits(): void {
  buckets.clear();
}

/**
 * The caller's IP for bucketing. Behind Vercel the client is the FIRST
 * `x-forwarded-for` entry; every later entry is a proxy and is trusted by
 * nobody. A request with no header at all shares one bucket, which fails closed
 * rather than open: a caller that can strip the header gets rate limited
 * alongside every other header-less caller instead of escaping the limit.
 */
export function clientIp(headers: Headers): string {
  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "unknown";
}
