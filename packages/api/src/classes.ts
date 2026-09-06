import { TRPCError } from "@trpc/server";

import type { DbReader, SQL, TenantTx } from "@matops/db";
import { and, eq, inArray, isNull, lt, ne, or, sql } from "@matops/db";
import { classInstance } from "@matops/db/schema";

import { CLASS_NOT_FOUND } from "./messages";

export function liveClass(classId: string): SQL | undefined {
  return and(eq(classInstance.id, classId), isNull(classInstance.deletedAt));
}

export interface ClassFacts {
  id: string;
  status: string;
  startsAt: Date;
  durationMinutes: number;
  deletedAt: Date | null;
}

export async function requireClassFacts(
  db: DbReader,
  classId: string,
): Promise<ClassFacts> {
  const [cls] = await db
    .select({
      id: classInstance.id,
      status: classInstance.status,
      startsAt: classInstance.startsAt,
      durationMinutes: classInstance.durationMinutes,
      deletedAt: classInstance.deletedAt,
    })
    .from(classInstance)
    .where(eq(classInstance.id, classId));
  if (!cls) {
    throw new TRPCError({ code: "NOT_FOUND", message: CLASS_NOT_FOUND });
  }
  return cls;
}

/**
 * Take a place, or report that there was not one (ADR 126).
 *
 * The guard lives in the UPDATE's own `WHERE`, not in a read before it, which
 * is what makes it safe: Postgres locks the class row for the duration, so two
 * requests reaching for the last place serialize, and the second re-evaluates
 * `booking_count < capacity` against the first one's committed value. A read
 * followed by a write would let both see the same free place.
 *
 * A `soft` class is unguarded and always succeeds, so the BJJ rule is untouched:
 * the count may pass capacity and is shown red (spec §4). Only `strict`, which
 * is what a general space's sessions are, can refuse.
 *
 * Returns whether a place was taken. The caller is inside the request's own
 * transaction, so refusing and throwing rolls the participation row back with
 * it and nothing half-books.
 */
export async function claimSeat(
  db: TenantTx,
  classId: string,
): Promise<boolean> {
  const claimed = await db
    .update(classInstance)
    .set({ bookingCount: sql`${classInstance.bookingCount} + 1` })
    .where(
      and(
        eq(classInstance.id, classId),
        or(
          ne(classInstance.capacityPolicy, "strict"),
          lt(classInstance.bookingCount, classInstance.capacity),
        ),
      ),
    )
    .returning({ id: classInstance.id });
  return claimed.length > 0;
}

/** The message a full session gives, in one place so every path says it. */
export const SESSION_FULL = "That session is full";

/**
 * Take a place ONLY when the room actually has a limit.
 *
 * The desk path (`attendance.addWalkIn`) is a correction as much as an
 * admission: at a BJJ academy, marking somebody present who never booked has
 * never moved `booking_count`, and `booking-count.test.ts` holds that invariant.
 * A strict room is different, because there the count IS the room, so admitting
 * a body has to take a place or the limit means nothing.
 *
 * So a soft class changes nothing and reports `strict: false`, and a strict one
 * behaves exactly like {@link claimSeat}. The caller needs both answers: only a
 * strict room actually put a place on the row, and only then does that row have
 * to record it.
 */
export async function claimSeatIfStrict(
  db: TenantTx,
  classId: string,
): Promise<{ strict: boolean; took: boolean }> {
  const [row] = await db
    .select({ policy: classInstance.capacityPolicy })
    .from(classInstance)
    .where(eq(classInstance.id, classId));
  if (row?.policy !== "strict") return { strict: false, took: true };
  return { strict: true, took: await claimSeat(db, classId) };
}

export async function releaseSeats(
  db: TenantTx,
  classIds: string[],
): Promise<void> {
  if (classIds.length === 0) return;
  await db
    .update(classInstance)
    .set({ bookingCount: sql`GREATEST(${classInstance.bookingCount} - 1, 0)` })
    .where(inArray(classInstance.id, classIds));
}
