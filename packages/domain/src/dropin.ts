import type { CheckInClass } from "./checkin";
import {
  academyDay,
  addLocalDays,
  localDate,
  localMidnight,
} from "./local-date";

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

export function dropInPath(
  token: string,
  sharedBy: string | null,
  classId?: string,
): string {
  const query = [
    classId && `class=${encodeURIComponent(classId)}`,
    sharedBy && `by=${encodeURIComponent(sharedBy)}`,
  ].filter(Boolean);
  return `/drop-in/${token}${query.length > 0 ? `?${query.join("&")}` : ""}`;
}

export function visitorPagePath(
  token: string,
  sharedBy: string | null,
): string {
  return `/academy/${token}${sharedBy ? `?by=${encodeURIComponent(sharedBy)}` : ""}`;
}

export const VISITOR_LIST_DAYS = 3;

/** Local days from today to the end of next week's Sunday: a class link and the
 * visitor page reach that far, so every class the page shows can be booked. */
export function visitorLinkDays(now: Date, timeZone: string): number {
  const daysSinceMonday = (localDate(now, timeZone).weekday + 6) % 7;
  return 14 - daysSinceMonday;
}

interface VisitorWindow {
  from: Date;
  to: Date;
}

export function visitorWindow(
  now: Date,
  timeZone: string,
  days = VISITOR_LIST_DAYS,
): VisitorWindow {
  const today = academyDay(now, timeZone);
  return {
    from: localMidnight(today, timeZone),
    to: localMidnight(addLocalDays(today, days), timeZone),
  };
}

export type VisitorClassState = "attend" | "book";

export function visitorClassState(
  c: CheckInClass,
  now: Date,
  timeZone: string,
  days = VISITOR_LIST_DAYS,
): VisitorClassState | null {
  if (c.status !== "scheduled") return null;
  const t = now.getTime();
  const start = c.startsAt.getTime();
  const window = visitorWindow(now, timeZone, days);
  if (start < window.from.getTime()) return null;
  const end = start + c.durationMinutes * 60_000;
  if (start <= t && t < end) return "attend";
  if (start > t && start < window.to.getTime()) return "book";
  return null;
}

export function visitorClassChoices<T extends CheckInClass>(
  classes: T[],
  now: Date,
  timeZone: string,
  days = VISITOR_LIST_DAYS,
): { now: T[]; upcoming: T[] } {
  const choices = { now: [] as T[], upcoming: [] as T[] };
  const sorted = [...classes].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  );
  for (const c of sorted) {
    const state = visitorClassState(c, now, timeZone, days);
    if (state === "attend") choices.now.push(c);
    if (state === "book") choices.upcoming.push(c);
  }
  return choices;
}

export interface VisitorPageDay<T> {
  day: string;
  classes: T[];
}

export interface VisitorPageWeek<T> {
  weekStart: string;
  days: VisitorPageDay<T>[];
}

/** This week and next week (Monday to Sunday, academy time) with only the
 * classes a visitor can still book. Days with no class are left out. */
export function visitorPageWeeks<T extends CheckInClass>(
  classes: T[],
  now: Date,
  timeZone: string,
): [VisitorPageWeek<T>, VisitorPageWeek<T>] {
  const today = academyDay(now, timeZone);
  const thisWeek = addLocalDays(
    today,
    -((localDate(now, timeZone).weekday + 6) % 7),
  );
  const nextWeek = addLocalDays(thisWeek, 7);
  const days = visitorLinkDays(now, timeZone);
  const weeks: [VisitorPageWeek<T>, VisitorPageWeek<T>] = [
    { weekStart: thisWeek, days: [] },
    { weekStart: nextWeek, days: [] },
  ];
  const bookable = classes
    .filter((c) => visitorClassState(c, now, timeZone, days) === "book")
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  for (const c of bookable) {
    const day = academyDay(c.startsAt, timeZone);
    const week = day < nextWeek ? weeks[0] : weeks[1];
    const last = week.days.at(-1);
    if (last?.day === day) last.classes.push(c);
    else week.days.push({ day, classes: [c] });
  }
  return weeks;
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
