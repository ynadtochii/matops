import { formatInTimeZone } from "date-fns-tz";

export const PUBLIC_RANGE_DEFAULT_DAYS = 7;
export const PUBLIC_CLASS_LIMIT = 200;

/**
 * A booking is refused once the class is closer than this. Not a capacity rule:
 * it stops a stranger booking a class already on the mat, where nobody will see
 * the roster change. Someone at the door is a walk-in and the gym QR handles it.
 */
export const BOOKING_CUTOFF_MINUTES = 60;

/**
 * Can this class still be booked? False only inside the cut-off or after the
 * class has started. Never false because a class is full: full is not a concept
 * this API has.
 */
export function isPubliclyBookable(startsAt: Date, now: Date): boolean {
  return startsAt.getTime() - now.getTime() > BOOKING_CUTOFF_MINUTES * 60_000;
}

export interface PublicClassInput {
  id: string;
  title: string;
  discipline: string | null;
  startsAt: Date;
  durationMinutes: number;
}

export interface PublicClassView {
  id: string;
  title: string;
  discipline: string | null;
  startsAt: string;
  durationMinutes: number;
  bookable: boolean;
}

/** The academy's own zone, in the shape "2026-09-01T18:30:00+01:00". */
export function publicInstant(at: Date, timeZone: string): string {
  return formatInTimeZone(at, timeZone, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

export function publicClassView(
  cls: PublicClassInput,
  timeZone: string,
  now: Date,
): PublicClassView {
  return {
    id: cls.id,
    title: cls.title,
    discipline: cls.discipline,
    startsAt: publicInstant(cls.startsAt, timeZone),
    durationMinutes: cls.durationMinutes,
    bookable: isPubliclyBookable(cls.startsAt, now),
  };
}
