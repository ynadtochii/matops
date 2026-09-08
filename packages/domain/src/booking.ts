/**
 * Pure booking rules (spec S4/S5, §4; docs/issues/13, 22, 23). No I/O — the
 * booking tRPC resolvers call these to decide the tier, reject unbookable
 * classes with a precise reason, and render the soft-capacity label. The atomic
 * write itself (the conditional UPDATE + participation upsert, ticket 13) lives
 * in the resolver, since it needs the DB; everything testable in isolation is
 * here.
 *
 * v1 capacity is a SOFT guide, never a gate: booking is never blocked and the
 * count MAY exceed capacity (ticket 13 session-12). Two tiers (ticket 22):
 * an approved member books CONFIRMED (counts toward `booking_count`); a pending
 * member books PROVISIONAL (recorded + tagged "pending approval", never counted).
 */

import type { Membership } from "./access";
import { isActiveMember } from "./access";
import { selfServiceWindow } from "./query-window";

/** Booking tier — mirrors the `booking_tier` DB enum. */
export type BookingTier = "confirmed" | "provisional";

/**
 * The tier a booking gets, from the booker's membership at book time. An
 * approved (active) member holds a real spot (`confirmed`, increments the
 * class count); a pending member's booking is `provisional` — shown "pending
 * approval", never counted (ticket 22). Only `confirmed` bookings ever move
 * `class.booking_count`.
 */
export function bookingTier(m: Pick<Membership, "status">): BookingTier {
  return isActiveMember(m) ? "confirmed" : "provisional";
}

/** The bits of a class the bookable guard reads. */
export interface BookableClass {
  status: string; // "scheduled" | "cancelled"
  startsAt: Date; // resolved UTC instant
  deletedAt: Date | null;
}

/**
 * How far ahead a student may book (spec S5, ADR 79). Both clients only ever
 * show a rolling seven-day week, so this is what closes the gap a deep link to
 * `/class/<id>` left open. Classes exist six months out for the owner's planning;
 * booking one of them is noise, because the gym's plans change first.
 */
export const DEFAULT_BOOKING_WINDOW_DAYS = 7;
export const BOOKING_WINDOW_DAYS = DEFAULT_BOOKING_WINDOW_DAYS;

export interface BookingRule {
  bookingWindowDays: number;
  timeZone: string;
}

export const DEFAULT_BOOKING_RULE: BookingRule = {
  bookingWindowDays: DEFAULT_BOOKING_WINDOW_DAYS,
  timeZone: "UTC",
};

/** Why a class cannot be booked (drives a precise, friendly error). */
export type NotBookableReason =
  "deleted" | "cancelled" | "past" | "too-far-ahead";

export interface BookableResult {
  ok: boolean;
  reason?: NotBookableReason;
}

/**
 * Can this class be booked right now? This is the FRIENDLY-ERROR guard, not the
 * race guard — capacity safety comes from the atomic UPDATE in the resolver
 * (ticket 13). A class is bookable when it is not soft-deleted, not cancelled,
 * has not already started, and starts inside the booking window. Capacity is
 * deliberately NOT checked here — booking is never blocked by a full room
 * (soft cap, §4).
 */
export function canBook(
  c: BookableClass,
  now: Date,
  rule: BookingRule = DEFAULT_BOOKING_RULE,
): BookableResult {
  if (c.deletedAt) return { ok: false, reason: "deleted" };
  if (c.status === "cancelled") return { ok: false, reason: "cancelled" };
  if (c.startsAt.getTime() <= now.getTime())
    return { ok: false, reason: "past" };
  if (
    c.startsAt.getTime() >= new Date(selfServiceWindow(now, rule).to).getTime()
  )
    return { ok: false, reason: "too-far-ahead" };
  return { ok: true };
}

/**
 * Why the Book button is off, in the student's words. `deleted` is excluded on
 * purpose: a deleted class is a 404, not a message, and the type forces every
 * caller to handle that case before asking for copy.
 */
export function notBookableMessage(
  reason: Exclude<NotBookableReason, "deleted">,
  bookingWindowDays = DEFAULT_BOOKING_WINDOW_DAYS,
): string {
  switch (reason) {
    case "cancelled":
      return "This class was cancelled";
    case "past":
      return "This class has already started";
    case "too-far-ahead":
      return `You can book up to ${bookingWindowDays} days ahead`;
  }
}

export interface CapacityDisplay {
  /** "N / M", or "No limit" when capacity is 0/unset. */
  label: string;
  /** At or over capacity → show red + a "book anyway?" confirm (spec S5). */
  isOver: boolean;
}

/**
 * The soft-capacity label + over-flag for a class card/detail (spec S5, §4).
 * A capacity of 0 (or less) means "no limit" — never over. Otherwise the count
 * is compared to capacity; at or above it, the UI turns red ("22/20 · may be
 * busy") and asks the user to confirm. The count MAY exceed capacity by design.
 */
export function capacityDisplay(
  bookingCount: number,
  capacity: number,
): CapacityDisplay {
  if (capacity <= 0) return { label: "No limit", isOver: false };
  return {
    label: `${bookingCount} / ${capacity}`,
    isOver: bookingCount >= capacity,
  };
}

/**
 * "N spots left" for a schedule row (spec S4). Capacity 0 means no cap, so it
 * never reads as full. Shared by both clients so one rule paints every row.
 */
export function spotsLeftLabel(capacity: number, bookingCount: number): string {
  if (capacity <= 0) return "Open";
  const left = capacity - bookingCount;
  if (left <= 0) return "Full";
  return `${left} spot${left === 1 ? "" : "s"} left`;
}

/**
 * How full the class is, for a student who already holds a spot ("12/20", or
 * "12 in" when the gym set no cap). Spots-left is the number that helps someone
 * decide to book; once booked, the useful number is who else is coming.
 */
export function fillLabel(capacity: number, bookingCount: number): string {
  if (capacity <= 0) return `${bookingCount} in`;
  return `${bookingCount}/${capacity}`;
}
