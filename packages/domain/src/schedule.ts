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

/** The three visual families a discipline collapses to (ADR 53). */
export type DisciplineTone = "gi" | "nogi" | "other";

/**
 * Which family a class's discipline belongs to. Cool for gi, warm for no-gi,
 * neutral for open mat because it is both. Every surface that paints a class
 * (the O2 week grid, the O1 day rail, the mobile schedule, the printed poster)
 * maps its own colours off this, so the same kind of training reads the same
 * everywhere.
 */
export function disciplineTone(discipline: string | null): DisciplineTone {
  if (discipline === "nogi" || discipline === "mma") return "nogi";
  if (discipline === "other") return "other";
  return "gi";
}
