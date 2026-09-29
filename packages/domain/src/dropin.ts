import type { CheckInClass } from "./checkin";
import { MAX_CLASS_MINUTES } from "./checkin";
import { academyDay, addLocalDays, localMidnight } from "./local-date";

/**
 * Pure drop-in / lead rules (spec O4/§4; ADR 147). No I/O. A drop-in is a
 * visitor with no account who books or attends a class through the academy's
 * drop-in link; the write itself lives in the db helper.
 */

/** Normalize a phone to a dedupe key: strip formatting so "+1 (555) 123" and
 * "+15551123" collapse to one lead per person (spec §4). The leading `+` is
 * kept, because this is also the number the owner reads and dials back, and
 * without it a country code is indistinguishable from an area code. */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return phone.trimStart().startsWith("+") ? `+${digits}` : digits;
}

export const VISITOR_BOOKING_DAYS = 7;

interface VisitorWindow {
  from: Date;
  to: Date;
}

export function visitorWindow(now: Date, timeZone: string): VisitorWindow {
  const today = academyDay(now, timeZone);
  return {
    from: new Date(now.getTime() - MAX_CLASS_MINUTES * 60_000),
    to: localMidnight(addLocalDays(today, VISITOR_BOOKING_DAYS), timeZone),
  };
}

export type VisitorClassState = "attend" | "book";

export function visitorClassState(
  c: CheckInClass,
  now: Date,
  timeZone: string,
): VisitorClassState | null {
  if (c.status !== "scheduled") return null;
  const t = now.getTime();
  const start = c.startsAt.getTime();
  const end = start + c.durationMinutes * 60_000;
  if (start <= t && t < end) return "attend";
  if (start > t && start < visitorWindow(now, timeZone).to.getTime()) {
    return "book";
  }
  return null;
}

export function visitorClassChoices<T extends CheckInClass>(
  classes: T[],
  now: Date,
  timeZone: string,
): { now: T[]; upcoming: T[] } {
  const sorted = [...classes].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  );
  return {
    now: sorted.filter((c) => visitorClassState(c, now, timeZone) === "attend"),
    upcoming: sorted.filter(
      (c) => visitorClassState(c, now, timeZone) === "book",
    ),
  };
}

export type ReturningLeadGate = "ok" | "agreement" | "full";

export function returningLeadGate(
  lead: {
    consent: boolean;
    email: string | null;
    belt: string | null;
    waiverId: string | null;
  },
  requiredWaiverId: string | null,
): ReturningLeadGate {
  if (!lead.consent || !lead.email || !lead.belt) return "full";
  if (requiredWaiverId && lead.waiverId !== requiredWaiverId) {
    return "agreement";
  }
  return "ok";
}
