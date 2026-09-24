/**
 * Pure reception rules (ADR 139). The entrance screen and the staff reception
 * screen both work over "the next few days at this branch", so the window, the
 * day grouping and the action on each card are decided here and never in a
 * resolver or a component.
 *
 * The action is the contract the user approved: a class is bookable until
 * `CHECK_IN_EARLY_MINUTES` before it starts, and checkable into from there
 * until it ends. Attendance therefore keeps its meaning. `present` is somebody
 * who was on the mat, and picking a later class reserves a place instead.
 */

import { canBook } from "./booking";
import { CHECK_IN_EARLY_MINUTES } from "./checkin";
import {
  academyDay,
  addLocalDays,
  localDate,
  localMidnight,
} from "./local-date";

const MIN_MS = 60 * 1000;

/**
 * How many days past today reception offers. Someone at the door can reserve a
 * place for the rest of the week without opening the app, and a gym closed on
 * Sunday still sees Monday from the desk on a Saturday. Callers may ask for
 * fewer days.
 */
export const RECEPTION_LOOKAHEAD_DAYS = 3;

export function receptionSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export interface ReceptionWindow {
  from: Date;
  to: Date;
}

/**
 * Local midnight today through local midnight after the last offered day, in
 * the BRANCH zone. Whole local days, so a gym an hour either side of UTC still
 * shows its own calendar.
 */
export function receptionClassWindow(
  now: Date,
  timeZone: string,
  daysAhead: number = RECEPTION_LOOKAHEAD_DAYS,
): ReceptionWindow {
  const today = academyDay(now, timeZone);
  return {
    from: localMidnight(today, timeZone),
    to: localMidnight(addLocalDays(today, daysAhead + 1), timeZone),
  };
}

export interface ReceptionClassInput {
  id: string;
  title: string;
  startsAt: Date;
  durationMinutes: number;
  status: string;
  deletedAt?: Date | null;
}

/** What the card offers. `closed` is a real class nobody can act on yet. */
export type ReceptionAction = "check-in" | "book" | "closed";

export interface ReceptionClassCard {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  /** Local days from today in the branch zone. 0 is today, 1 tomorrow. */
  dayOffset: number;
  action: ReceptionAction;
}

interface ReceptionRule {
  timeZone: string;
  bookingWindowDays: number;
  daysAhead?: number;
}

function endOf(cls: ReceptionClassInput): Date {
  return new Date(cls.startsAt.getTime() + cls.durationMinutes * MIN_MS);
}

/**
 * The action for one class. Check-in opens `CHECK_IN_EARLY_MINUTES` before the
 * start and closes at the exact end. Before that the class is bookable, but
 * only inside the branch's own booking window: a gym that lets members book one
 * day ahead does not let reception book two.
 */
export function receptionClassAction(
  cls: ReceptionClassInput,
  now: Date,
  rule: ReceptionRule,
): ReceptionAction {
  const opens = cls.startsAt.getTime() - CHECK_IN_EARLY_MINUTES * MIN_MS;
  if (now.getTime() >= opens) return "check-in";
  return canBook(
    {
      status: cls.status,
      startsAt: cls.startsAt,
      deletedAt: cls.deletedAt ?? null,
    },
    now,
    rule,
  ).ok
    ? "book"
    : "closed";
}

/**
 * The offered classes, soonest first. A class is on the list when it starts
 * inside the local days on offer and has not ended yet, so the one running
 * right now stays selectable until its exact end. Cancelled and deleted classes
 * never appear.
 */
export function receptionClasses(
  classes: ReceptionClassInput[],
  now: Date,
  rule: ReceptionRule,
): ReceptionClassCard[] {
  const window = receptionClassWindow(now, rule.timeZone, rule.daysAhead);
  const today = localDate(now, rule.timeZone).dayNumber;
  return classes
    .filter((cls) => {
      if (cls.status === "cancelled" || cls.deletedAt) return false;
      const start = cls.startsAt.getTime();
      if (start < window.from.getTime() || start >= window.to.getTime())
        return false;
      return endOf(cls).getTime() > now.getTime();
    })
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map((cls) => ({
      id: cls.id,
      title: cls.title,
      startsAt: cls.startsAt,
      endsAt: endOf(cls),
      dayOffset: localDate(cls.startsAt, rule.timeZone).dayNumber - today,
      action: receptionClassAction(cls, now, rule),
    }));
}

/**
 * The class to offer without being asked: the one running or about to run, and
 * otherwise the soonest one that can still be booked. A class that has already
 * started is the right default rather than one to skip past, because somebody
 * at the desk at 18:10 is there for the class that began at 18:00.
 *
 * Two classes open for check-in at once is the one case with no honest answer,
 * so it returns null and the screen asks. Guessing between overlapping mats is
 * the bug ADR 117 fixed for visitors, and a default must not bring it back.
 *
 * It needs no clock. `receptionClassAction` has already read it into each
 * card's action, and `receptionClasses` has already sorted them soonest-first.
 */
export function defaultReceptionClass<T extends { action: ReceptionAction }>(
  cards: T[],
): T | null {
  const open = cards.filter((card) => card.action === "check-in");
  if (open.length > 1) return null;
  return open[0] ?? cards.find((card) => card.action === "book") ?? null;
}
