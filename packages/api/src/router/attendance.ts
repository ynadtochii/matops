import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import type { DbExec, TenantTx } from "@matops/db";
import {
  and,
  asc,
  attendanceReviewSnapshot,
  desc,
  eq,
  eventRole,
  getTableColumns,
  inArray,
  isNull,
  lockAndReadScheduleRevision,
  ne,
  or,
  recordActivity,
  recordMilestone,
  sql,
} from "@matops/db";
import {
  attendanceCorrection,
  classInstance,
  classParticipation,
  dropInVisit,
  user,
} from "@matops/db/schema";
import {
  attendanceCounts,
  attendanceReview,
  attendanceReviewError,
  attendanceWriteAccess,
  bulkMarkTargets,
  publicFileUrl,
  runsBranch,
} from "@matops/domain";
import {
  AddWalkInSchema,
  AttendanceReviewQueueSchema,
  ClassIdSchema,
  FinishAttendanceSchema,
  MarkAllAttendanceSchema,
  MarkAttendanceSchema,
  MarkVisitorSchema,
} from "@matops/validators";

import { academyTimeZone } from "../academy-tz";
import { loadAttendanceRoster } from "../attendance-review";
import { requireClassFacts } from "../classes";
import { directoryRosterOf } from "../members";
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
    const members = await directoryRosterOf(ctx);
    return members
      .filter((m) => m.status === "active")
      .map((m) => ({
        id: m.personId,
        name: m.name,
        role: m.role,
        avatarUrl: publicFileUrl(ctx.appUrl, m.avatarKey),
      }));
  }),

  /**
   * Everyone on a class (spec O5): booked (confirmed + provisional) + walk-ins
   * (from `class_participation`) plus no-app drop-ins (from `drop_in`, slice 3.5),
   * with names and marks. Plus the summary counts for the header.
   */
  list: staffProcedure.input(ClassIdSchema).query(async ({ ctx, input }) => {
    const data = await loadAttendanceRoster(ctx.db, input.id);
    if (!data)
      throw new TRPCError({ code: "NOT_FOUND", message: "Class not found." });
    const { rows, dropIns, review } = data;
    const roster = await directoryRosterOf(ctx);
    const roleByUser = new Map(
      roster.map((person) => [person.userId, person.role]),
    );
    const avatarByStudent = new Map(
      roster.map((person) => [
        person.userId,
        publicFileUrl(ctx.appUrl, person.avatarKey),
      ]),
    );
    const corrections = await ctx.db
      .select({
        id: attendanceCorrection.id,
        kind: attendanceCorrection.kind,
        subjectId: attendanceCorrection.subjectId,
        beforeValue: attendanceCorrection.beforeValue,
        afterValue: attendanceCorrection.afterValue,
        reason: attendanceCorrection.reason,
        actorName: user.name,
        createdAt: attendanceCorrection.createdAt,
      })
      .from(attendanceCorrection)
      .leftJoin(user, eq(user.id, attendanceCorrection.actorId))
      .where(eq(attendanceCorrection.classId, input.id))
      .orderBy(desc(attendanceCorrection.createdAt));
    return {
      rows: rows.map((row) => ({
        ...row,
        role: roleByUser.get(row.studentId) ?? null,
        avatarUrl: avatarByStudent.get(row.studentId) ?? null,
      })),
      dropIns,
      counts: attendanceCounts(rows),
      review,
      corrections,
    };
  }),

  reviewQueue: staffProcedure
    .input(AttendanceReviewQueueSchema)
    .query(async ({ ctx, input }) => {
      const zone = await academyTimeZone(ctx);
      const { classes, needsReview } = endedClasses(ctx.db, new Date());
      const filters = and(
        input.status === "needs_review" ? needsReview : undefined,
        input.from
          ? sql`(${classes.startsAt} AT TIME ZONE ${zone})::date >= ${input.from}::date`
          : undefined,
        input.to
          ? sql`(${classes.startsAt} AT TIME ZONE ${zone})::date <= ${input.to}::date`
          : undefined,
      );
      const [counts] = await ctx.db
        .with(classes)
        .select({
          total: sql<number>`count(*) FILTER (WHERE ${filters ?? sql`true`})::int`,
          needsReview: sql<number>`count(*) FILTER (WHERE ${needsReview})::int`,
        })
        .from(classes);
      const rows = await ctx.db
        .with(classes)
        .select()
        .from(classes)
        .where(filters)
        .orderBy(asc(classes.startsAt), asc(classes.id))
        .limit(50)
        .offset(input.offset);
      return {
        rows: rows.map(({ snapshot, ...row }) => ({
          ...row,
          markedCount: snapshot.present + snapshot.absent,
          review: attendanceReview(
            snapshot,
            row.attendanceReviewFingerprint,
            row.attendanceReviewedAt,
          ),
        })),
        timeZone: zone,
        total: counts?.total ?? 0,
        needsReview: counts?.needsReview ?? 0,
      };
    }),

  finish: staffProcedure
    .input(FinishAttendanceSchema)
    .mutation(async ({ ctx, input }) => {
      const correction = await assertMarkable(ctx, input.id, input.reason);
      await finishReview(
        ctx,
        input.id,
        input.fingerprint,
        input.nobodyAttended,
        correction,
      );
      return { ok: true as const };
    }),

  markAllClasses: staffProcedure.mutation(async ({ ctx }) => {
    const { classes, needsReview } = endedClasses(ctx.db, new Date());
    const unmarkedWalkIn = sql<boolean>`(EXISTS (
        SELECT 1 FROM ${classParticipation}
        WHERE ${classParticipation.classId} = ${classes.id}
          AND ${classParticipation.bookingStatus} = 'none'
          AND ${classParticipation.attendanceStatus} = 'unmarked')
      OR EXISTS (
        SELECT 1 FROM ${dropInVisit}
        WHERE ${dropInVisit.classId} = ${classes.id}
          AND ${dropInVisit.bookingStatus} = 'none'
          AND ${dropInVisit.attendanceStatus} = 'unmarked'))`;
    const targets = await ctx.db
      .with(classes)
      .select({ id: classes.id })
      .from(classes)
      .where(and(needsReview, sql`NOT ${unmarkedWalkIn}`))
      .orderBy(asc(classes.startsAt), asc(classes.id))
      .limit(MARK_ALL_CLASSES_LIMIT);
    let reviewed = 0;
    let present = 0;
    for (const { id } of targets) {
      present +=
        (await markBookedPresent(ctx, id, undefined)) +
        (await markBookedVisitorsPresent(ctx, id));
      const [row] = await ctx.db
        .select({ snapshot: attendanceReviewSnapshot() })
        .from(classInstance)
        .where(eq(classInstance.id, id));
      if (!row) continue;
      try {
        await finishReview(
          ctx,
          id,
          row.snapshot.fingerprint,
          row.snapshot.present === 0,
          undefined,
        );
        reviewed++;
      } catch (error) {
        if (error instanceof TRPCError && error.code === "CONFLICT") continue;
        throw error;
      }
    }
    const [left] = await ctx.db
      .with(classes)
      .select({
        remaining: sql<number>`count(*) FILTER (WHERE NOT ${unmarkedWalkIn})::int`,
        byHand: sql<number>`count(*) FILTER (WHERE ${unmarkedWalkIn})::int`,
      })
      .from(classes)
      .where(needsReview);
    if (present > 0) recordAttendance(ctx);
    return {
      reviewed,
      present,
      remaining: left?.remaining ?? 0,
      byHand: left?.byHand ?? 0,
    };
  }),

  /** Mark an existing participant present/absent/unmarked (spec O5). */
  mark: staffProcedure
    .input(MarkAttendanceSchema)
    .mutation(async ({ ctx, input }) => {
      const correction = await assertMarkable(ctx, input.classId, input.reason);
      const present = input.status === "present";
      const roster = await directoryRosterOf(ctx);
      const subject = roster.find(
        (row) =>
          row.personId === input.personId ||
          row.accountUserId === input.personId,
      );
      if (!subject) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Person not found" });
      }
      const subjectPersonId =
        subject.personId === subject.accountUserId ? null : subject.personId;
      const subjectWhere = or(
        subjectPersonId
          ? eq(classParticipation.personId, subjectPersonId)
          : undefined,
        subject.accountUserId
          ? and(
              isNull(classParticipation.personId),
              eq(classParticipation.studentId, subject.accountUserId),
            )
          : undefined,
      );
      const [before] = await ctx.db
        .select({
          id: classParticipation.id,
          status: classParticipation.attendanceStatus,
        })
        .from(classParticipation)
        .where(and(eq(classParticipation.classId, input.classId), subjectWhere))
        .for("update");
      if (!before) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This person hasn't booked. Add them as a walk-in instead.",
        });
      }
      const [row] = await ctx.db
        .update(classParticipation)
        .set({
          attendanceStatus: input.status,
          attendedAt: present ? new Date() : null,
          markedBy: ctx.session.user.id,
          ...(present
            ? {
                checkInSource: sql`coalesce(${classParticipation.checkInSource}, 'staff')`,
              }
            : {}),
        })
        .where(and(eq(classParticipation.classId, input.classId), subjectWhere))
        .returning({ id: classParticipation.id });
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This person hasn't booked. Add them as a walk-in instead.",
        });
      }
      if (before.status !== input.status) {
        await recordHistoricalCorrection(
          ctx.db,
          ctx.academyId,
          input.classId,
          correction,
          {
            kind: "member",
            subjectId: row.id,
            beforeValue: before.status,
            afterValue: input.status,
            actorId: ctx.session.user.id,
          },
        );
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
    .input(MarkAllAttendanceSchema)
    .mutation(async ({ ctx, input }) => {
      const correction = await assertMarkable(ctx, input.id, input.reason);
      const marked = await markBookedPresent(ctx, input.id, correction);
      if (marked > 0) recordAttendance(ctx);
      return { marked };
    }),

  /**
   * Add a walk-in: a member who attended without booking (spec O5). Records a
   * participation row with booking `none` + attendance `present` — never touches
   * `booking_count`. If the member already booked, this just marks them present.
   */
  addWalkIn: staffProcedure
    .input(AddWalkInSchema)
    .mutation(async ({ ctx, input }) => {
      await lockAndReadScheduleRevision(ctx.db, ctx.academyId);
      const correction = await assertMarkable(ctx, input.classId, input.reason);
      // Defense-in-depth: the RLS WITH CHECK only scopes academy_id, not that the
      // student is a member — so verify membership before recording a walk-in.
      const roster = await directoryRosterOf(ctx);
      const subject = roster.find(
        (person) =>
          (person.personId === input.personId ||
            person.accountUserId === input.personId) &&
          person.status === "active",
      );
      if (!subject) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That person does not have active access to this academy",
        });
      }
      const subjectPersonId =
        subject.personId === subject.accountUserId ? null : subject.personId;
      const now = new Date();
      // Admitting somebody at the desk takes a place in a STRICT room, the same
      // as booking one, unless they already hold one. Two rules meet here and
      // both are kept: marking an existing booking present must not claim a
      // second place, and at a BJJ academy a walk-in has never moved the count
      // at all, which `booking-count.test.ts` holds (ADR 126).
      const [held] = await ctx.db
        .select({
          id: classParticipation.id,
          status: classParticipation.bookingStatus,
          tier: classParticipation.bookingTier,
          attendanceStatus: classParticipation.attendanceStatus,
        })
        .from(classParticipation)
        .where(
          and(
            eq(classParticipation.classId, input.classId),
            or(
              subjectPersonId
                ? eq(classParticipation.personId, subjectPersonId)
                : undefined,
              subject.accountUserId
                ? and(
                    isNull(classParticipation.personId),
                    eq(classParticipation.studentId, subject.accountUserId),
                  )
                : undefined,
            ),
          ),
        );
      const values = {
        personOrganizationId: subjectPersonId ? ctx.organizationId : null,
        personId: subjectPersonId,
        studentId: subject.accountUserId,
        bookingStatus: held?.status,
        bookingTier: held?.tier,
        attendanceStatus: "present" as const,
        attendedAt: now,
        markedBy: ctx.session.user.id,
      };
      // `coalesce` on the target column is only legal where a row already
      // exists, so the plain INSERT below names the source outright and both
      // update paths keep whoever recorded the attendance first.
      const keepSource = {
        checkInSource: sql`coalesce(${classParticipation.checkInSource}, 'staff')`,
      };
      const [saved] = held
        ? await ctx.db
            .update(classParticipation)
            .set({ ...values, ...keepSource })
            .where(eq(classParticipation.id, held.id))
            .returning({ id: classParticipation.id })
        : await ctx.db
            .insert(classParticipation)
            .values({
              academyId: ctx.academyId,
              classId: input.classId,
              ...values,
              checkInSource: "staff",
              bookingStatus: "none",
              bookingTier: "confirmed",
            })
            .onConflictDoUpdate({
              target: subjectPersonId
                ? [classParticipation.classId, classParticipation.personId]
                : [classParticipation.classId, classParticipation.studentId],
              targetWhere: subjectPersonId
                ? sql`person_id is not null`
                : undefined,
              set: { ...values, ...keepSource },
            })
            .returning({ id: classParticipation.id });
      if (!saved) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      }
      if (held?.attendanceStatus !== "present") {
        await recordHistoricalCorrection(
          ctx.db,
          ctx.academyId,
          input.classId,
          correction,
          {
            kind: "member",
            subjectId: saved.id,
            beforeValue: held?.attendanceStatus ?? null,
            afterValue: "present",
            actorId: ctx.session.user.id,
          },
        );
      }
      return { ok: true as const };
    }),

  /**
   * Mark a visitor present or absent on the class register (spec O5). Before
   * ADR 115 a visitor was present by construction, so a booked visitor who
   * never arrived could not be recorded as a no-show.
   */
  markVisitor: staffProcedure
    .input(MarkVisitorSchema)
    .mutation(async ({ ctx, input }) => {
      const correction = await assertMarkable(ctx, input.classId, input.reason);
      const present = input.status === "present";
      const [before] = await ctx.db
        .select({ status: dropInVisit.attendanceStatus })
        .from(dropInVisit)
        .where(
          and(
            eq(dropInVisit.id, input.visitId),
            eq(dropInVisit.classId, input.classId),
          ),
        )
        .for("update");
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
            or(
              ne(dropInVisit.bookingStatus, "cancelled"),
              ne(dropInVisit.attendanceStatus, "unmarked"),
            ),
          ),
        )
        .returning({ id: dropInVisit.id });
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "That visitor is not on this class",
        });
      }
      if (before && before.status !== input.status) {
        await recordHistoricalCorrection(
          ctx.db,
          ctx.academyId,
          input.classId,
          correction,
          {
            kind: "visitor",
            subjectId: row.id,
            beforeValue: before.status,
            afterValue: input.status,
            actorId: ctx.session.user.id,
          },
        );
      }
      return { ok: true as const };
    }),
} satisfies TRPCRouterRecord;

function recordAttendance(ctx: {
  organizationId: string;
  academyId: string;
  membership: { role: string };
  afterCommit: (task: (exec: DbExec) => Promise<void>) => void;
}) {
  ctx.afterCommit(async (exec) => {
    const event = {
      organizationId: ctx.organizationId,
      entityId: ctx.academyId,
      actorRole: eventRole(ctx.membership.role),
    };
    await recordMilestone({ ...event, name: "first_attendance" }, exec);
    await recordActivity({ ...event, name: "student_attendance" }, exec);
    await recordActivity({ ...event, name: "staff_action" }, exec);
  });
}

async function assertMarkable(
  ctx: { db: TenantTx; membership: { role: string; status: string } },
  classId: string,
  reason?: string,
) {
  const cls = await requireClassFacts(ctx.db, classId);
  const access = attendanceWriteAccess(
    cls,
    new Date(),
    runsBranch(ctx.membership),
  );
  if (access === "closed") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Attendance can only be marked for today or the last 14 days",
    });
  }
  if (access === "reason-required" && !reason) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Enter a reason for changing attendance older than 14 days",
    });
  }
  return access === "reason-required" ? reason : undefined;
}

const MARK_ALL_CLASSES_LIMIT = 200;

interface StaffCtx {
  db: TenantTx;
  academyId: string;
  session: { user: { id: string } };
}

function endedClasses(db: TenantTx, now: Date) {
  const classes = db.$with("attendance_review_classes").as(
    db
      .select({
        ...getTableColumns(classInstance),
        instructorName: user.name,
        snapshot: attendanceReviewSnapshot().as("snapshot"),
        pendingCount:
          sql<number>`(SELECT count(*)::int FROM ${classParticipation}
          WHERE ${classParticipation.classId} = ${classInstance.id}
          AND ${classParticipation.bookingStatus} = 'booked'
          AND ${classParticipation.bookingTier} = 'provisional')`.as(
            "pending_count",
          ),
      })
      .from(classInstance)
      .leftJoin(user, eq(user.id, classInstance.instructorId))
      .where(
        and(
          isNull(classInstance.deletedAt),
          eq(classInstance.status, "scheduled"),
          sql`${classInstance.startsAt} + ${classInstance.durationMinutes} * interval '1 minute' <= ${now}`,
        ),
      ),
  );
  const reviewed = sql<boolean>`${classes.attendanceReviewedAt} IS NOT NULL AND ${classes.attendanceReviewFingerprint} = ${classes.snapshot}->>'fingerprint'`;
  return {
    classes,
    needsReview: sql<boolean>`NOT coalesce((${reviewed}), false)`,
  };
}

async function markBookedPresent(
  ctx: StaffCtx,
  classId: string,
  correction: string | undefined,
) {
  const rows = await ctx.db
    .select({
      id: classParticipation.id,
      studentId: sql<string>`coalesce(${classParticipation.personId}::text, ${classParticipation.studentId})`,
      bookingStatus: classParticipation.bookingStatus,
      attendanceStatus: classParticipation.attendanceStatus,
    })
    .from(classParticipation)
    .where(eq(classParticipation.classId, classId));
  const targets = bulkMarkTargets(rows);
  if (targets.length === 0) return 0;
  const changed = await ctx.db
    .update(classParticipation)
    .set({
      attendanceStatus: "present",
      attendedAt: new Date(),
      markedBy: ctx.session.user.id,
      checkInSource: sql`coalesce(${classParticipation.checkInSource}, 'staff')`,
    })
    .where(
      and(
        eq(classParticipation.classId, classId),
        eq(classParticipation.attendanceStatus, "unmarked"),
        inArray(
          sql<string>`coalesce(${classParticipation.personId}::text, ${classParticipation.studentId})`,
          targets,
        ),
      ),
    )
    .returning({ id: classParticipation.id });
  await Promise.all(
    changed.map((row) =>
      recordHistoricalCorrection(ctx.db, ctx.academyId, classId, correction, {
        kind: "member",
        subjectId: row.id,
        beforeValue: "unmarked",
        afterValue: "present",
        actorId: ctx.session.user.id,
      }),
    ),
  );
  return changed.length;
}

async function markBookedVisitorsPresent(ctx: StaffCtx, classId: string) {
  const changed = await ctx.db
    .update(dropInVisit)
    .set({
      attendanceStatus: "present",
      attendedAt: new Date(),
      markedBy: ctx.session.user.id,
    })
    .where(
      and(
        eq(dropInVisit.classId, classId),
        eq(dropInVisit.bookingStatus, "booked"),
        eq(dropInVisit.attendanceStatus, "unmarked"),
      ),
    )
    .returning({ id: dropInVisit.id });
  return changed.length;
}

async function finishReview(
  ctx: StaffCtx,
  classId: string,
  fingerprint: string,
  nobodyAttended: boolean,
  correction: string | undefined,
) {
  const data = await loadAttendanceRoster(ctx.db, classId);
  if (!data)
    throw new TRPCError({ code: "NOT_FOUND", message: "Class not found." });
  const now = new Date();
  if (
    data.deletedAt ||
    data.status === "cancelled" ||
    data.startsAt.getTime() + data.durationMinutes * 60000 > now.getTime()
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Attendance can only be finished after a live class ends.",
    });
  }
  const error = attendanceReviewError(
    data.snapshot,
    fingerprint,
    nobodyAttended,
  );
  if (error) throw new TRPCError({ code: "CONFLICT", message: error });
  const [saved] = await ctx.db
    .update(classInstance)
    .set({
      attendanceReviewedAt: now,
      attendanceReviewedBy: ctx.session.user.id,
      attendanceReviewFingerprint: fingerprint,
    })
    .where(
      and(
        eq(classInstance.id, classId),
        isNull(classInstance.deletedAt),
        eq(classInstance.status, "scheduled"),
        sql`${classInstance.startsAt} + ${classInstance.durationMinutes} * interval '1 minute' <= ${now}`,
        sql`${attendanceReviewSnapshot()}->>'fingerprint' = ${fingerprint}`,
      ),
    )
    .returning({ id: classInstance.id });
  if (!saved)
    throw new TRPCError({
      code: "CONFLICT",
      message: "Attendance changed. Review the latest list and try again.",
    });
  await recordHistoricalCorrection(ctx.db, ctx.academyId, classId, correction, {
    kind: "review",
    subjectId: null,
    beforeValue: data.savedFingerprint,
    afterValue: fingerprint,
    actorId: ctx.session.user.id,
  });
}

async function recordHistoricalCorrection(
  db: DbExec | TenantTx,
  academyId: string,
  classId: string,
  reason: string | undefined,
  change: {
    kind: "member" | "visitor" | "review";
    subjectId: string | null;
    beforeValue: string | null;
    afterValue: string | null;
    actorId: string;
  },
) {
  if (!reason) return;
  await db.insert(attendanceCorrection).values({
    academyId,
    classId,
    reason,
    ...change,
  });
}
