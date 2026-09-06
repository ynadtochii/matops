/**
 * Do two sessions want the room at the same time (ADR 126)?
 *
 * A general space has one bookable room in this release, so two sessions that
 * share any moment cannot both run. A BJJ academy is untouched: two mats
 * running at once is normal there, and this rule is never asked about them.
 *
 * Ranges are HALF-OPEN: a session runs [start, end), so 10:00-11:00 and
 * 11:00-12:00 are back to back and do not clash. Anything else would refuse a
 * perfectly ordinary timetable.
 */

export interface SessionSpan {
  /** Present for a session that already exists; absent for the one proposed. */
  id?: string;
  startsAt: Date;
  durationMinutes: number;
}

export function sessionEnd(session: SessionSpan): Date {
  return new Date(
    session.startsAt.getTime() + session.durationMinutes * 60_000,
  );
}

/** True when the two share any moment at all. */
export function spansOverlap(a: SessionSpan, b: SessionSpan): boolean {
  return (
    a.startsAt.getTime() < sessionEnd(b).getTime() &&
    b.startsAt.getTime() < sessionEnd(a).getTime()
  );
}

/**
 * The first existing session the proposed one runs into, or undefined.
 *
 * A session never clashes with itself, so rescheduling one by five minutes is
 * allowed rather than being refused by its own old row.
 *
 * The self-check is only made when the proposed session HAS an id. A span with
 * none is new, so it cannot be its own old row, and comparing two undefined ids
 * would make every pair of new sessions look like the same one and clash with
 * nothing.
 */
export function findOverlap(
  proposed: SessionSpan,
  existing: SessionSpan[],
): SessionSpan | undefined {
  return existing.find(
    (s) =>
      (proposed.id === undefined || s.id !== proposed.id) &&
      spansOverlap(proposed, s),
  );
}

/** The first proposed session that clashes with an existing one, or undefined. */
export function firstClash(
  proposed: SessionSpan[],
  existing: SessionSpan[],
): { proposed: SessionSpan; clashesWith: SessionSpan } | undefined {
  const all = [...existing];
  for (const p of proposed) {
    const hit = findOverlap(p, all);
    if (hit) return { proposed: p, clashesWith: hit };
    // A run of new sessions must not clash with each other either.
    all.push(p);
  }
  return undefined;
}
