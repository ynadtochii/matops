import { TRPCError } from "@trpc/server";

import type { TenantTx } from "@matops/db";
import {
  and,
  bumpScheduleRevision,
  eq,
  isNull,
  lockAndReadScheduleRevision,
  or,
  sql,
} from "@matops/db";
import { classInstance, classParticipation } from "@matops/db/schema";
import { BOOKING_LOCKED, bookingTier, canCheckIn } from "@matops/domain";

import { claimSeat } from "./classes";
import { bookingGate } from "./payments-gate";

export async function checkInMember(
  db: TenantTx,
  input: Parameters<typeof bookingGate>[1] & {
    classId: string;
    organizationId: string;
  },
) {
  await lockAndReadScheduleRevision(db, input.entity.id);
  const [cls] = await db
    .select()
    .from(classInstance)
    .where(eq(classInstance.id, input.classId))
    .for("update");
  if (!cls)
    throw new TRPCError({ code: "NOT_FOUND", message: "Class not found." });
  if (cls.status === "cancelled" || cls.deletedAt) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "That class isn't running",
    });
  }
  if (!canCheckIn(cls, new Date())) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "No class to check into right now",
    });
  }

  const me = input.accountUserId;
  const now = new Date();

  const gate = await bookingGate(db, {
    entity: input.entity,
    membership: input.membership,
    accountUserId: me,
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
  const [existing] = await db
    .select({
      id: classParticipation.id,
      bookingStatus: classParticipation.bookingStatus,
      bookingTier: classParticipation.bookingTier,
      attendanceStatus: classParticipation.attendanceStatus,
    })
    .from(classParticipation)
    .where(
      and(
        eq(classParticipation.classId, input.classId),
        or(
          input.membership.personId
            ? eq(classParticipation.personId, input.membership.personId)
            : undefined,
          and(
            isNull(classParticipation.personId),
            me ? eq(classParticipation.studentId, me) : sql`false`,
          ),
        ),
      ),
    );
  const willBook = !existing || existing.bookingStatus === "cancelled";

  if (
    existing?.attendanceStatus === "present" &&
    existing.bookingStatus !== "cancelled"
  ) {
    return { ok: true as const, tier: existing.bookingTier, booked: false };
  }
  const attendance = { attendanceStatus: "present" as const, attendedAt: now };
  if (existing) {
    await db
      .update(classParticipation)
      .set({
        ...attendance,
        ...(willBook
          ? {
              bookingStatus: "booked" as const,
              bookingTier: tier,
              cancelledAt: null,
            }
          : {}),
      })
      .where(eq(classParticipation.id, existing.id));
  } else {
    await db.insert(classParticipation).values({
      academyId: input.entity.id,
      classId: input.classId,
      personOrganizationId: input.membership.personId
        ? input.organizationId
        : null,
      personId: input.membership.personId,
      studentId: me,
      bookingStatus: "booked",
      bookingTier: tier,
      ...attendance,
    });
  }

  if (willBook && tier === "confirmed") {
    await claimSeat(db, input.classId);
  }

  if (willBook) await bumpScheduleRevision(db, input.entity.id);

  return { ok: true as const, tier, booked: willBook };
}
