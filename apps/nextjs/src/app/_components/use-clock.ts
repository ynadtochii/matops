"use client";

import { useEffect, useState } from "react";

/**
 * A `Date` that re-renders its caller once a minute. Every "now" marker reads
 * off this, so a tab left open all evening never draws a stale clock or keeps
 * calling an ended class the live one. The value is day-aligned by every query
 * window that consumes it, so ticking never changes a query key.
 */
export function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}
