import type { CheckInClass } from "./checkin";
import { MAX_CLASS_MINUTES } from "./checkin";
import { academyDay, addLocalDays, localMidnight } from "./local-date";

export const DESK_UNDO_SECONDS = 30;
export const DESK_SEARCH_MIN = 2;
export const DESK_SEARCH_MAX = 10;
export const DESK_SOURCE = "reception_self";

const MIN_MS = 60_000;

export function deskWindow(
  now: Date,
  timeZone: string,
): { from: Date; to: Date } {
  const today = academyDay(now, timeZone);
  const midnight = localMidnight(today, timeZone);
  const longest = new Date(now.getTime() - MAX_CLASS_MINUTES * MIN_MS);
  return {
    from: longest < midnight ? longest : midnight,
    to: localMidnight(addLocalDays(today, 2), timeZone),
  };
}

export function deskClasses<T extends CheckInClass>(
  classes: T[],
  now: Date,
  timeZone: string,
): {
  tomorrow: boolean;
  classes: (T & { open: boolean; opensAt: Date | null })[];
} {
  const t = now.getTime();
  const today = academyDay(now, timeZone);
  const live = classes
    .filter(
      (c) =>
        c.status !== "cancelled" &&
        c.startsAt.getTime() + c.durationMinutes * MIN_MS > t,
    )
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const todays = live.filter((c) => academyDay(c.startsAt, timeZone) <= today);
  const tomorrow = todays.length === 0;
  const tomorrowDay = addLocalDays(today, 1);
  const shown = tomorrow
    ? live.filter((c) => academyDay(c.startsAt, timeZone) === tomorrowDay)
    : todays;
  const starts = [...new Set(shown.map((c) => c.startsAt.getTime()))];
  const firstStarted = starts[0] !== undefined && starts[0] <= t;
  return {
    tomorrow: tomorrow && shown.length > 0,
    classes: shown.map((c) => {
      const step = starts.indexOf(c.startsAt.getTime());
      const open = !tomorrow && (step === 0 || (step === 1 && firstStarted));
      const before = starts[step - 1];
      return {
        ...c,
        open,
        opensAt: open || before === undefined ? null : new Date(before),
      };
    }),
  };
}

// Two classes open at once returns null: the screen asks rather than guessing between mats (ADR 117).
export function deskDefaultClass<T extends { open: boolean }>(
  classes: T[],
): T | null {
  const open = classes.filter((c) => c.open);
  if (open.length > 1) return null;
  return open[0] ?? classes[0] ?? null;
}

function shortName(name: string): string {
  const words = name.trim().split(/\s+/);
  const first = words[0] ?? "";
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  return last ? `${first} ${last.charAt(0).toUpperCase()}.` : first;
}

export function deskNames<T extends { id: string; name: string }>(
  members: T[],
): Map<string, string> {
  const counts = new Map<string, number>();
  for (const m of members) {
    const key = shortName(m.name).toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Map(
    members.map((m) => {
      const short = shortName(m.name);
      const clash = (counts.get(short.toLowerCase()) ?? 0) > 1;
      return [m.id, clash ? m.name.trim().replace(/\s+/g, " ") : short];
    }),
  );
}

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export function deskSearch<T extends { name: string }>(
  members: T[],
  query: string,
): T[] {
  const typed = fold(query).split(/\s+/).filter(Boolean);
  if (typed.join("").length < DESK_SEARCH_MIN) return [];
  return members
    .filter((m) => {
      const words = fold(m.name).split(/\s+/);
      return typed.every((t) => words.some((w) => w.startsWith(t)));
    })
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, DESK_SEARCH_MAX);
}

interface DeskCheckInRow {
  checkInSource: string | null;
  markedBy: string | null;
  attendanceStatus: string;
  attendedAt: Date | null;
}

export function canUndoDeskCheckIn(row: DeskCheckInRow, now: Date): boolean {
  if (row.checkInSource !== DESK_SOURCE || row.markedBy !== null) return false;
  if (row.attendanceStatus !== "present" || !row.attendedAt) return false;
  const age = now.getTime() - row.attendedAt.getTime();
  return age >= 0 && age < DESK_UNDO_SECONDS * 1000;
}
