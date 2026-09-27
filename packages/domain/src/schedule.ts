/**
 * Pure helpers for the scheduling domain (Phase 2). Framework-free — the server,
 * both clients, and the validators share these. The DST-aware materialization
 * math (local minutes + IANA zone → UTC instants) lands here in slice 2.2; this
 * file holds the small shared constants + formatting rules.
 */

export const MINUTES_PER_DAY = 24 * 60;

/**
 * How far ahead concrete classes are materialized (docs/issues/16, 79). A
 * template save fills this window immediately; the owner's Rebuild schedule
 * button refills it from scratch. No scheduler extends it (ADR 46, 79).
 */
export const MATERIALIZATION_HORIZON_DAYS = 180; // ~6 months

/** 0=Sun … 6=Sat — the order the DB stores and the UI renders. */
export const DAY_LABELS = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

function isValidDayOfWeek(day: number): boolean {
  return Number.isInteger(day) && day >= 0 && day <= 6;
}

/** Sort ascending + drop duplicates, so a template's days are canonical. */
export function normalizeDaysOfWeek(days: number[]): number[] {
  return [...new Set(days.filter(isValidDayOfWeek))].sort((a, b) => a - b);
}

/** Local minutes-from-midnight → "HH:MM" (24h, zero-padded). */
export function formatStartMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Human summary of a recurrence, e.g. "Mon, Wed · 18:00" (spec O3). */
export function describeRecurrence(
  daysOfWeek: number[],
  startsAtMinutes: number,
): string {
  const days = normalizeDaysOfWeek(daysOfWeek)
    .map((d) => DAY_LABELS[d])
    .join(", ");
  return `${days} · ${formatStartMinutes(startsAtMinutes)}`;
}

/** How many disciplines get their own colour. The rest stay neutral. */
export const DISCIPLINE_HUE_COUNT = 5;

/**
 * The colour slot (0 to 4) of a class's discipline: its place in the
 * academy's discipline list. Unset, unlisted or past the fifth → null, the
 * neutral default. Every surface that paints a class (the week grid, the day
 * rail, the dots, the mobile schedule, the poster) indexes its own palette
 * with this, so one discipline reads the same everywhere.
 */
export function disciplineHue(
  discipline: string | null,
  order: readonly string[],
): number | null {
  if (!discipline) return null;
  const key = discipline.toLowerCase();
  const index = order.findIndex((name) => name.toLowerCase() === key);
  return index >= 0 && index < DISCIPLINE_HUE_COUNT ? index : null;
}
