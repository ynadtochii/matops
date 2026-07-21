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

/** Why a class cannot be booked (drives a precise, friendly error). */
export type NotBookableReason = "deleted" | "cancelled" | "past";

export interface BookableResult {
  ok: boolean;
  reason?: NotBookableReason;
}

/**
 * Can this class be booked right now? This is the FRIENDLY-ERROR guard, not the
 * race guard — capacity safety comes from the atomic UPDATE in the resolver
 * (ticket 13). A class is bookable when it is not soft-deleted, not cancelled,
 * and has not already started. Capacity is deliberately NOT checked here —
 * booking is never blocked by a full room (soft cap, §4).
 */
export function canBook(c: BookableClass, now: Date): BookableResult {
  if (c.deletedAt) return { ok: false, reason: "deleted" };
  if (c.status === "cancelled") return { ok: false, reason: "cancelled" };
  if (c.startsAt.getTime() <= now.getTime())
    return { ok: false, reason: "past" };
  return { ok: true };
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
