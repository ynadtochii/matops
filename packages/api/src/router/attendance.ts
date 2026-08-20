import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import type { TenantTx } from "@matops/db";
import {
  and,
  createDropIn,
  eq,
  getMembership,
  inArray,
  listMembersOf,
} from "@matops/db";
import {
  classInstance,
  classParticipation,
  dropIn,
  user,
} from "@matops/db/schema";
import {
  attendanceCounts,
  bulkMarkTargets,
  canMarkAttendance,
  normalizePhone,
} from "@matops/domain";
import {
  AddVisitorSchema,
  AddWalkInSchema,
  ClassIdSchema,
  MarkAttendanceSchema,
} from "@matops/validators";

import { staffProcedure } from "../trpc";

/**
 * Attendance (slice 3.3, spec O5, §4; docs/issues/08, 24). Staff-only (owner or
 * instructor — both take attendance): list who's on a class, mark present/absent,
 * add a walk-in. Names ARE visible here (staff see everyone for attendance). All
 * on the RLS-scoped `ctx.db`. Self check-ins (QR, slice 3.4) and drop-ins (3.5)
 * surface in the same list, already marked present.
 */
export const attendanceRouter = {
  /** Active members of the academy (id = user.id, name) for the walk-in picker. */
  members: staffProcedure.query(async ({ ctx }) => {
    // Members live in the auth `member` table (no RLS); list + filter to active.
    const members = await listMembersOf(ctx.academyId, ctx.db);
    return members
      .filter((m) => m.status === "active")
      .map((m) => ({ id: m.userId, name: m.name }));
  }),

  /**
   * Everyone on a class (spec O5): booked (confirmed + provisional) + walk-ins
   * (from `class_participation`) plus no-app drop-ins (from `drop_in`, slice 3.5),
   * with names and marks. Plus the summary counts for the header.
   */
  list: staffProcedure.input(ClassIdSchema).query(async ({ ctx, input }) => {
    const rows = await ctx.db
      .select({
        studentId: classParticipation.studentId,
        name: user.name,
        bookingStatus: classParticipation.bookingStatus,
        bookingTier: classParticipation.bookingTier,
        attendanceStatus: classParticipation.attendanceStatus,
        attendedAt: classParticipation.attendedAt,
      })
      .from(classParticipation)
      .leftJoin(user, eq(user.id, classParticipation.studentId))
      .where(eq(classParticipation.classId, input.id));
    const dropIns = await ctx.db
      .select({
        id: dropIn.id,
        firstName: dropIn.firstName,
        lastName: dropIn.lastName,
        phone: dropIn.phone,
      })
      .from(dropIn)
      .where(eq(dropIn.classId, input.id));
    return { rows, dropIns, counts: attendanceCounts(rows) };
  }),

  /** Mark an existing participant present/absent/unmarked (spec O5). */
  mark: staffProcedure
    .input(MarkAttendanceSchema)
    .mutation(async ({ ctx, input }) => {
      await assertMarkable(ctx.db, input.classId);
      const present = input.status === "present";
      const [row] = await ctx.db
        .update(classParticipation)
        .set({
          attendanceStatus: input.status,
          attendedAt: present ? new Date() : null,
          markedBy: ctx.session.user.id,
        })
        .where(
          and(
            eq(classParticipation.classId, input.classId),
            eq(classParticipation.studentId, input.studentId),
          ),
        )
        .returning({ id: classParticipation.id });
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This person hasn't booked — add them as a walk-in instead",
        });
      }
      return { ok: true as const };
    }),

  /**
   * Mark everyone who booked present in one go (v1.3, F.2 — spec O5). Flips the
   * **booked + unmarked** rows to present (the pure `bulkMarkTargets` picks them),
   * leaving explicit absents and walk-ins untouched. One bounded `UPDATE` in the
   * request's RLS transaction; respects the ≤14-day backfill window. Returns how
   * many were flipped so the client can toast it.
   */
  markAll: staffProcedure
    .input(ClassIdSchema)
    .mutation(async ({ ctx, input }) => {
      await assertMarkable(ctx.db, input.id);
      const rows = await ctx.db
        .select({
          studentId: classParticipation.studentId,
          bookingStatus: classParticipation.bookingStatus,
          attendanceStatus: classParticipation.attendanceStatus,
        })
        .from(classParticipation)
        .where(eq(classParticipation.classId, input.id));
      const targets = bulkMarkTargets(rows);
      if (targets.length === 0) return { marked: 0 };
      await ctx.db
        .update(classParticipation)
        .set({
          attendanceStatus: "present",
          attendedAt: new Date(),
          markedBy: ctx.session.user.id,
        })
        .where(
          and(
            eq(classParticipation.classId, input.id),
            eq(classParticipation.attendanceStatus, "unmarked"),
            inArray(classParticipation.studentId, targets),
          ),
        );
      return { marked: targets.length };
    }),

  /**
   * Add a walk-in: a member who attended without booking (spec O5). Records a
   * participation row with booking `none` + attendance `present` — never touches
   * `booking_count`. If the member already booked, this just marks them present.
   */
  addWalkIn: staffProcedure
    .input(AddWalkInSchema)
    .mutation(async ({ ctx, input }) => {
      await assertMarkable(ctx.db, input.classId);
      // Defense-in-depth: the RLS WITH CHECK only scopes academy_id, not that the
      // student is a member — so verify membership before recording a walk-in.
      const membership = await getMembership(
        input.studentId,
        ctx.academyId,
        ctx.db,
      );
      if (!membership) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That person is not a member of this academy",
        });
      }
      const now = new Date();
      await ctx.db
        .insert(classParticipation)
        .values({
          academyId: ctx.academyId,
          classId: input.classId,
          studentId: input.studentId,
          bookingStatus: "none",
          bookingTier: "confirmed",
          attendanceStatus: "present",
          attendedAt: now,
          markedBy: ctx.session.user.id,
        })
        .onConflictDoUpdate({
          // If they DID book, keep booking_status — just mark them present.
          target: [classParticipation.classId, classParticipation.studentId],
          set: {
            attendanceStatus: "present",
            attendedAt: now,
            markedBy: ctx.session.user.id,
          },
        });
      return { ok: true as const };
    }),

  /**
   * Record a visitor who is NOT a member on this class (spec O5, slice 3.5's
   * `drop_in` table). Same lead the public QR form writes, so a person the gym
   * signs in at the door and a person who fills the form themselves dedupe onto
   * one row by phone. Staff cannot give contact consent for someone else, so
   * this writes `consent: false`; the `OR` in `createDropIn` means it never
   * clears a consent the visitor gave earlier.
   */
  addVisitor: staffProcedure
    .input(AddVisitorSchema)
    .mutation(async ({ ctx, input }) => {
      await assertMarkable(ctx.db, input.classId);
      const { visitCount } = await createDropIn({
        academyId: ctx.academyId,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: normalizePhone(input.phone),
        email: null,
        classId: input.classId,
        consent: false,
      });
      return { firstVisit: visitCount === 1, visitCount };
    }),
} satisfies TRPCRouterRecord;

/** Load the class and assert it is inside the attendance backfill window (O5). */
async function assertMarkable(db: TenantTx, classId: string) {
  const [cls] = await db
    .select({
      status: classInstance.status,
      startsAt: classInstance.startsAt,
      deletedAt: classInstance.deletedAt,
    })
    .from(classInstance)
    .where(eq(classInstance.id, classId));
  if (!cls) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Class not found" });
  }
  if (!canMarkAttendance(cls, new Date())) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Attendance can only be marked for today or the last 14 days",
    });
  }
}
