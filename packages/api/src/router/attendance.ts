import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import type { DbExec, TenantTx } from "@matops/db";
import {
  and,
  createDropIn,
  eq,
  eventRole,
  inArray,
  ne,
  recordActivity,
  recordMilestone,
} from "@matops/db";
import {
  classParticipation,
  dropIn,
  dropInVisit,
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
  MarkVisitorSchema,
} from "@matops/validators";

import { claimSeatIfStrict, requireClassFacts, SESSION_FULL } from "../classes";
import { requireMembership, rosterOf } from "../members";
import { staffIdentityProcedure, staffProcedure } from "../trpc";

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
    const members = await rosterOf(ctx);
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
        id: dropInVisit.id,
        leadId: dropIn.id,
        firstName: dropIn.firstName,
        lastName: dropIn.lastName,
        phone: dropIn.phone,
        bookingStatus: dropInVisit.bookingStatus,
        attendanceStatus: dropInVisit.attendanceStatus,
      })
      .from(dropInVisit)
      .innerJoin(dropIn, eq(dropIn.id, dropInVisit.dropInId))
      .where(
        and(
          eq(dropInVisit.classId, input.id),
          ne(dropInVisit.bookingStatus, "cancelled"),
        ),
      );
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
      if (present) recordAttendance(ctx);
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
      recordAttendance(ctx);
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
      await requireMembership(
        input.studentId,
        ctx.academyId,
        ctx.db,
        "That person is not a member of this academy",
      );
      const now = new Date();
      // Admitting somebody at the desk takes a place in a STRICT room, the same
      // as booking one, unless they already hold one. Two rules meet here and
      // both are kept: marking an existing booking present must not claim a
      // second place, and at a BJJ academy a walk-in has never moved the count
      // at all, which `booking-count.test.ts` holds (ADR 126).
      const [held] = await ctx.db
        .select({
          status: classParticipation.bookingStatus,
          tier: classParticipation.bookingTier,
        })
        .from(classParticipation)
        .where(
          and(
            eq(classParticipation.classId, input.classId),
            eq(classParticipation.studentId, input.studentId),
          ),
        );
      // A row only protects a place when it actually holds one. A cancelled
      // booking gave its place back and a provisional one never took a place,
      // so admitting either at the desk claims one like anybody else.
      const holdsSeat =
        held !== undefined &&
        held.status !== "cancelled" &&
        held.tier === "confirmed";
      let claimed = false;
      if (!holdsSeat) {
        const seat = await claimSeatIfStrict(ctx.db, input.classId);
        if (!seat.took) {
          throw new TRPCError({ code: "CONFLICT", message: SESSION_FULL });
        }
        claimed = seat.strict;
      }
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
          // If they DID book, keep booking_status — just mark them present. A
          // place this admission just claimed is written onto the row, or the
          // next admission of the same person would take a second one.
          target: [classParticipation.classId, classParticipation.studentId],
          set: claimed
            ? {
                bookingStatus:
                  held?.status === "cancelled"
                    ? "none"
                    : (held?.status ?? "none"),
                bookingTier: "confirmed",
                attendanceStatus: "present",
                attendedAt: now,
                markedBy: ctx.session.user.id,
              }
            : {
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
  addVisitor: staffIdentityProcedure
    .input(AddVisitorSchema)
    .mutation(async ({ ctx, input }) => {
      await ctx.withScope((db) => assertMarkable(db, input.classId));
      const { visitCount } = await createDropIn(
        {
          academyId: ctx.academyId,
          firstName: input.firstName,
          lastName: input.lastName,
          phone: normalizePhone(input.phone),
          email: null,
          classId: input.classId,
          consent: false,
          source: "staff",
        },
        ctx.baseDb,
      );
      return { firstVisit: visitCount <= 1, visitCount };
    }),

  /**
   * Mark a visitor present or absent on the class register (spec O5). Before
   * ADR 115 a visitor was present by construction, so a booked visitor who
   * never arrived could not be recorded as a no-show.
   */
  markVisitor: staffProcedure
    .input(MarkVisitorSchema)
    .mutation(async ({ ctx, input }) => {
      await assertMarkable(ctx.db, input.classId);
      const present = input.status === "present";
      const [row] = await ctx.db
        .update(dropInVisit)
        .set({
          attendanceStatus: input.status,
          attendedAt: present ? new Date() : null,
          markedBy: ctx.session.user.id,
        })
        .where(
          and(
            eq(dropInVisit.id, input.visitId),
            eq(dropInVisit.classId, input.classId),
            ne(dropInVisit.bookingStatus, "cancelled"),
          ),
        )
        .returning({ id: dropInVisit.id });
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That visitor is not on this class",
        });
      }
      return { ok: true as const };
    }),
} satisfies TRPCRouterRecord;

function recordAttendance(ctx: {
  organizationId: string;
  entityId: string;
  membership: { role: string };
  afterCommit: (task: (exec: DbExec) => Promise<void>) => void;
}) {
  ctx.afterCommit(async (exec) => {
    const event = {
      organizationId: ctx.organizationId,
      entityId: ctx.entityId,
      actorRole: eventRole(ctx.membership.role),
    };
    await recordMilestone({ ...event, name: "first_attendance" }, exec);
    await recordActivity({ ...event, name: "student_attendance" }, exec);
    await recordActivity({ ...event, name: "staff_action" }, exec);
  });
}

/** Load the class and assert it is inside the attendance backfill window (O5). */
async function assertMarkable(db: TenantTx, classId: string) {
  const cls = await requireClassFacts(db, classId);
  if (!canMarkAttendance(cls, new Date())) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Attendance can only be marked for today or the last 14 days",
    });
  }
}
