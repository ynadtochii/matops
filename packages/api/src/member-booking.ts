import { TRPCError } from "@trpc/server";

import type { TenantTx } from "@matops/db";
import {
  and,
  bumpScheduleRevision,
  eq,
  isNull,
  lockAndReadScheduleRevision,
  ne,
  sql,
} from "@matops/db";
import { classParticipation } from "@matops/db/schema";
import {
  BOOKING_LOCKED,
  bookingTier,
  canBook,
  notBookableMessage,
} from "@matops/domain";

import { claimSeat, requireClassFacts, SESSION_FULL } from "./classes";
import { CLASS_NOT_FOUND } from "./messages";
import { bookingGate } from "./payments-gate";

export type BookForMemberInput = Parameters<typeof bookingGate>[1] & {
  classId: string;
  academyId: string;
  organizationId: string;
  bookingWindowDays: number;
  timeZone: string;
};

/**
 * Book one named person onto one class (ADR 139). The caller decides WHO; this
 * decides whether that person may have the place.
 *
 * Idempotent: a second call on an already-booked class returns `booked: false`
 * and leaves the count alone.
 */
export async function bookForMember(
  db: TenantTx,
  input: BookForMemberInput,
): Promise<{ ok: true; tier: "confirmed" | "provisional"; booked: boolean }> {
  await lockAndReadScheduleRevision(db, input.academyId);
  const cls = await requireClassFacts(db, input.classId);
  const bookable = canBook(cls, new Date(), {
    bookingWindowDays: input.bookingWindowDays,
    timeZone: input.timeZone,
  });
  if (bookable.reason === "deleted") {
    throw new TRPCError({ code: "NOT_FOUND", message: CLASS_NOT_FOUND });
  }
  if (bookable.reason) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: notBookableMessage(bookable.reason, input.bookingWindowDays),
    });
  }

  const gate = await bookingGate(db, {
    entity: input.entity,
    membership: input.membership,
    accountUserId: input.accountUserId,
    sessionAt: cls.startsAt,
  });
  if (gate.locked) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: gate.message ?? BOOKING_LOCKED,
    });
  }
  const tier = gate.provisional
    ? ("provisional" as const)
    : bookingTier(input.membership);

  if (input.membership.personId && input.accountUserId) {
    await db
      .update(classParticipation)
      .set({
        personOrganizationId: input.organizationId,
        personId: input.membership.personId,
      })
      .where(
        and(
          eq(classParticipation.classId, input.classId),
          eq(classParticipation.studentId, input.accountUserId),
          isNull(classParticipation.personId),
        ),
      );
  }

  const [transition] = await db
    .insert(classParticipation)
    .values({
      academyId: input.academyId,
      classId: input.classId,
      personOrganizationId: input.membership.personId
        ? input.organizationId
        : null,
      personId: input.membership.personId,
      studentId: input.accountUserId,
      bookingStatus: "booked",
      bookingTier: tier,
      cancelledAt: null,
    })
    .onConflictDoUpdate({
      target: input.membership.personId
        ? [classParticipation.classId, classParticipation.personId]
        : [classParticipation.classId, classParticipation.studentId],
      targetWhere: input.membership.personId
        ? sql`person_id is not null`
        : undefined,
      set: { bookingStatus: "booked", bookingTier: tier, cancelledAt: null },
      setWhere: ne(classParticipation.bookingStatus, "booked"),
    })
    .returning({ id: classParticipation.id });

  if (transition && tier === "confirmed") {
    const took = await claimSeat(db, input.classId);
    if (!took) {
      throw new TRPCError({ code: "CONFLICT", message: SESSION_FULL });
    }
  }
  if (transition) await bumpScheduleRevision(db, input.academyId);

  return { ok: true as const, tier, booked: !!transition };
}
