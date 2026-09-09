import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import type { DbExec, TenantTx } from "@matops/db";
import type { Membership } from "@matops/domain";
import {
  and,
  asc,
  attendanceReviewSnapshot,
  bumpScheduleRevision,
  createNotice,
  deliverNoticeBatch,
  eq,
  eventRole,
  getTableColumns,
  gte,
  insertNotifications,
  isNull,
  lockAndReadScheduleRevision,
  lockBranchSchedule,
  lt,
  or,
  overlappingSessions,
  recordActivity,
  recordMilestone,
  sql,
} from "@matops/db";
import {
  classInstance,
  classParticipation,
  dropIn,
  dropInVisit,
  entity,
  person,
  user,
} from "@matops/db/schema";
import {
  buildCancelledMessage,
  buildClassChangeMessage,
  canReassignCoach,
  capacityPolicyFor,
  classChange,
  findOverlap,
  formatWhen,
  instantFromLocalDate,
  instructorForNewSession,
  isGeneralSpace,
  selfServiceWindow,
} from "@matops/domain";
import { sendEmail } from "@matops/notifications";
import {
  ClassIdSchema,
  CreateClassSchema,
  SetClassInstructorSchema,
  WeekWindowSchema,
} from "@matops/validators";

import type { TimeZoneCtx } from "../academy-tz";
import { academyContext, academyTimeZone } from "../academy-tz";
import { liveClass } from "../classes";
import { requireInstructor } from "../members";
import { CLASS_NOT_FOUND, ROOM_TAKEN } from "../messages";
import { notifyClassCancelled, notifyClassChanged } from "../notify";
import { enrolledProcedure, staffProcedure } from "../trpc";

/**
 * Concrete classes (spec O2, §4 edit rules). Staff-only. One-off create,
 * per-instance edit/cancel, and the staff week read that O2 renders. All on the
 * RLS-scoped `ctx.db`. The student-facing (enrolled) schedule read is slice 2.4.
 *
 * `status` is `scheduled | cancelled` only — "past" is derived from
 * `starts_at + duration < now()` at read time (docs/issues/19), never stored.
 */
/**
 * Guard the K.2 rule on every path that can move credit: any staff member may
 * set the coach on a class that has not started, but once it has, the field is
 * reported history and only an owner may rewrite it (spec O10).
 */
function assertCanReassignCoach(
  membership: Membership,
  classStartsAt: Date,
  now: Date,
): void {
  if (!canReassignCoach(membership, classStartsAt, now)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only an owner can change the coach on a past class",
    });
  }
}

/** The slice of a staff context the change-notification needs. */
interface NotifyScope {
  db: TimeZoneCtx["db"];
  academyId: string;
  afterCommit: (task: (exec: DbExec) => Promise<void>) => void;
}

/**
 * Tell every booked student that a class moved or changed coach (§4,
 * docs/issues/17). Shared by the full edit and the K.2 coach reassignment so
 * the two can never drift apart. Callers decide WHETHER to notify via
 * `classChange`; this only sends.
 */
type ClassNotifier = typeof notifyClassChanged;

export async function notifyBooked(
  ctx: NotifyScope,
  row: { id: string; title: string; startsAt: Date; updatedAt: Date },
  kind: "class_changed" | "class_cancelled",
  send: ClassNotifier,
): Promise<{
  noticeId: string;
  delivery: {
    claimed: number;
    accepted: number;
    failed: number;
    unknown: number;
    noEmail: number;
    remaining: number;
  };
}> {
  const booked = await ctx.db
    .select({
      studentId: classParticipation.studentId,
      personId: classParticipation.personId,
      userEmail: user.email,
      personEmail: person.email,
    })
    .from(classParticipation)
    .leftJoin(user, eq(user.id, classParticipation.studentId))
    .leftJoin(person, eq(person.id, classParticipation.personId))
    .where(
      and(
        eq(classParticipation.classId, row.id),
        eq(classParticipation.bookingStatus, "booked"),
      ),
    );
  const visitors = await ctx.db
    .select({ visitId: dropInVisit.id, email: dropIn.email })
    .from(dropInVisit)
    .innerJoin(dropIn, eq(dropIn.id, dropInVisit.dropInId))
    .where(
      and(
        eq(dropInVisit.classId, row.id),
        eq(dropInVisit.bookingStatus, "booked"),
      ),
    );
  const timeZone = await academyTimeZone(ctx);
  const [academy] = await ctx.db
    .select({ name: entity.name })
    .from(entity)
    .where(eq(entity.id, ctx.academyId))
    .limit(1);
  const messageInput = {
    academyName: academy?.name ?? "your gym",
    className: row.title,
    whenLabel: formatWhen(row.startsAt, timeZone),
  };
  const message =
    kind === "class_cancelled"
      ? buildCancelledMessage(messageInput)
      : buildClassChangeMessage(messageInput);
  const eventKey = `${kind}:${row.id}:${row.updatedAt.toISOString()}`;
  const recipients = [
    ...booked.flatMap((recipient) => {
      if (!recipient.personId && !recipient.studentId) return [];
      return [
        {
          recipientKey: recipient.personId
            ? `person:${recipient.personId}`
            : `user:${recipient.studentId}`,
          ...(recipient.personId ? { personId: recipient.personId } : {}),
          ...(recipient.studentId ? { userId: recipient.studentId } : {}),
          email: recipient.personEmail ?? recipient.userEmail ?? undefined,
        },
      ];
    }),
    ...visitors.map((recipient) => ({
      recipientKey: `visitor:${recipient.visitId}`,
      visitId: recipient.visitId,
      email: recipient.email ?? undefined,
    })),
  ];
  const notice = await createNotice(
    {
      academyId: ctx.academyId,
      eventKey,
      kind,
      subject: message.title,
      body: message.body,
      templateVersion: "1",
      recipients,
    },
    ctx.db,
  );
  await insertNotifications(
    booked.flatMap((recipient) =>
      recipient.studentId
        ? [
            {
              academyId: ctx.academyId,
              userId: recipient.studentId,
              kind,
              title: message.title,
              body: message.body,
              link: `/class/${row.id}`,
            },
          ]
        : [],
    ),
    ctx.db,
  );
  const studentIds = booked.flatMap((recipient) =>
    recipient.studentId ? [recipient.studentId] : [],
  );
  const delivery = {
    claimed: 0,
    accepted: 0,
    failed: 0,
    unknown: 0,
    noEmail: notice.recipients.filter(
      (recipient) => recipient.status === "no_email",
    ).length,
    remaining: notice.recipients.filter(
      (recipient) => recipient.status === "pending",
    ).length,
  };
  ctx.afterCommit(async (exec) => {
    const result = await deliverNoticeBatch(exec, sendEmail, {
      noticeId: notice.noticeId,
      mode: "remaining",
    });
    Object.assign(delivery, result);
    await send(
      {
        academyId: ctx.academyId,
        className: row.title,
        startsAt: row.startsAt,
        timeZone,
        classId: row.id,
        studentIds,
      },
      exec,
    );
  });
  return { noticeId: notice.noticeId, delivery };
}

/**
 * One bookable room per general branch (ADR 126). Takes the branch lock and
 * refuses if anything live is already in the way, both inside the request's own
 * transaction, so two people adding a session at the same minute queue rather
 * than both winning. A BJJ academy runs two mats at once and is not asked.
 */
async function assertRoomFree(
  ctx: { db: TenantTx; academyId: string; entity: { type: string } },
  span: { startsAt: Date; durationMinutes: number },
): Promise<void> {
  if (!isGeneralSpace(ctx.entity.type)) return;
  await lockBranchSchedule(ctx.db, ctx.academyId);
  const taken = await overlappingSessions(ctx.db, ctx.academyId, [span]);
  if (findOverlap(span, taken)) {
    throw new TRPCError({ code: "CONFLICT", message: ROOM_TAKEN });
  }
}

export const classRouter = {
  /**
   * Classes in [from, to) for the active academy, soonest first (O2 week view).
   * `bookingCount` is the CONFIRMED count; `pendingCount` (slice 3.2) counts the
   * provisional bookings so the owner sees "N/cap · +M pending". `markedCount`
   * (slice D.2) counts the participations already marked present or absent, so
   * the O1 dashboard can spot a finished class whose register nobody filled in.
   * The subqueries are RLS-scoped like the outer query, so they only count this
   * academy's rows.
   */
  week: staffProcedure.input(WeekWindowSchema).query(({ ctx, input }) => {
    return ctx.db
      .select({
        ...getTableColumns(classInstance),
        instructorName: user.name,
        attendanceReviewed: sql<boolean>`coalesce(${classInstance.attendanceReviewedAt} IS NOT NULL AND ${classInstance.attendanceReviewFingerprint} = ${attendanceReviewSnapshot()}->>'fingerprint', false)`,
        pendingCount: sql<number>`(
          SELECT count(*)::int FROM ${classParticipation}
          WHERE ${classParticipation.classId} = ${classInstance.id}
            AND ${classParticipation.bookingStatus} = 'booked'
            AND ${classParticipation.bookingTier} = 'provisional'
        )`,
        markedCount: sql<number>`(
          SELECT count(*)::int FROM ${classParticipation}
          WHERE ${classParticipation.classId} = ${classInstance.id}
            AND ${classParticipation.attendanceStatus} <> 'unmarked'
        )`,
      })
      .from(classInstance)
      .leftJoin(user, eq(user.id, classInstance.instructorId))
      .where(
        and(
          isNull(classInstance.deletedAt),
          gte(classInstance.startsAt, new Date(input.from)),
          lt(classInstance.startsAt, new Date(input.to)),
        ),
      )
      .orderBy(asc(classInstance.startsAt));
  }),

  /**
   * The student schedule read (spec S4) — the SAME week, but on the enrolled
   * tier so a PENDING member can browse too (view-only, docs/issues/23). RLS
   * scopes it to the caller's active academy, so a student can only ever see
   * their own gym's classes. Used by the deferred Expo student home; the fields
   * (title/time/duration/capacity/booking_count) are all a student may see —
   * attendee names are a Phase-3 booking concern, not returned here.
   */
  mine: enrolledProcedure.input(WeekWindowSchema).query(async ({ ctx }) => {
    const academy = await academyContext(ctx);
    const window = selfServiceWindow(new Date(), {
      bookingWindowDays: academy.bookingWindowDays,
      timeZone: academy.timeZone,
    });
    return ctx.db
      .select({
        id: classInstance.id,
        title: classInstance.title,
        description: classInstance.description,
        discipline: classInstance.discipline,
        startsAt: classInstance.startsAt,
        durationMinutes: classInstance.durationMinutes,
        capacity: classInstance.capacity,
        bookingCount: classInstance.bookingCount,
        status: classInstance.status,
        instructorId: classInstance.instructorId,
        instructorName: user.name,
        // The caller's OWN booking (slice 3.1): drives the inline "Booked" pill
        // (spec S4). Left-joined + filtered to studentId=me, so at most one row.
        myBooking: classParticipation.bookingStatus, // "booked" | "cancelled" | null
        myBookingTier: classParticipation.bookingTier, // "confirmed" | "provisional" | null
      })
      .from(classInstance)
      .leftJoin(user, eq(user.id, classInstance.instructorId))
      .leftJoin(
        classParticipation,
        and(
          eq(classParticipation.classId, classInstance.id),
          or(
            ctx.membership.personId
              ? eq(classParticipation.personId, ctx.membership.personId)
              : undefined,
            and(
              isNull(classParticipation.personId),
              eq(classParticipation.studentId, ctx.session.user.id),
            ),
          ),
        ),
      )
      .where(
        and(
          isNull(classInstance.deletedAt),
          gte(classInstance.startsAt, new Date(window.from)),
          lt(classInstance.startsAt, new Date(window.to)),
        ),
      )
      .orderBy(asc(classInstance.startsAt));
  }),

  /**
   * One class by id for the student detail screen (spec S5). Enrolled tier, so a
   * PENDING member may view it too (read-only — booking is Phase 3). RLS scopes
   * it to the caller's active academy. Left-joins `user` for the instructor name
   * (matops_app has SELECT on the auth tables and `user` carries no RLS).
   */
  get: enrolledProcedure.input(ClassIdSchema).query(async ({ ctx, input }) => {
    const [row] = await ctx.db
      .select({
        id: classInstance.id,
        title: classInstance.title,
        description: classInstance.description,
        discipline: classInstance.discipline,
        startsAt: classInstance.startsAt,
        durationMinutes: classInstance.durationMinutes,
        capacity: classInstance.capacity,
        bookingCount: classInstance.bookingCount,
        status: classInstance.status,
        instructorId: classInstance.instructorId,
        instructorName: user.name,
        // The caller's OWN booking (slice 3.1): drives the Book vs Cancel button
        // and the "pending approval" tag on S5. Filtered to studentId=me.
        myBooking: classParticipation.bookingStatus, // "booked" | "cancelled" | null
        myBookingTier: classParticipation.bookingTier, // "confirmed" | "provisional" | null
      })
      .from(classInstance)
      .leftJoin(user, eq(user.id, classInstance.instructorId))
      .leftJoin(
        classParticipation,
        and(
          eq(classParticipation.classId, classInstance.id),
          or(
            ctx.membership.personId
              ? eq(classParticipation.personId, ctx.membership.personId)
              : undefined,
            and(
              isNull(classParticipation.personId),
              eq(classParticipation.studentId, ctx.session.user.id),
            ),
          ),
        ),
      )
      .where(liveClass(input.id));
    if (!row) {
      throw new TRPCError({ code: "NOT_FOUND", message: CLASS_NOT_FOUND });
    }
    return row;
  }),

  /**
   * Who else is on a class (spec S5, §4 schedule privacy, ADR 55). Enrolled tier,
   * so a pending member may call it — they just get counts back.
   */
  /** Create a one-off class (`template_id` null). Local date+time → UTC instant. */
  create: staffProcedure
    .input(CreateClassSchema)
    .mutation(async ({ ctx, input }) => {
      await lockAndReadScheduleRevision(ctx.db, ctx.academyId);
      const startsAt = instantFromLocalDate(
        input.date,
        input.startsAtMinutes,
        input.timeZone,
      );
      const instructorId = instructorForNewSession(
        ctx.entity.type,
        input.instructorId,
        ctx.session.user.id,
      );
      if (instructorId !== null && instructorId !== ctx.session.user.id) {
        await requireInstructor(ctx, instructorId);
      }
      await assertRoomFree(ctx, {
        startsAt,
        durationMinutes: input.durationMinutes,
      });
      const [row] = await ctx.db
        .insert(classInstance)
        .values({
          academyId: ctx.academyId,
          templateId: null,
          instructorId,
          title: input.title,
          description: input.description,
          discipline: input.discipline ?? null,
          startsAt,
          durationMinutes: input.durationMinutes,
          capacity: input.capacity,
          capacityPolicy: capacityPolicyFor(ctx.entity.type),
          publicBookable: input.publicBookable,
        })
        .returning();
      if (row) await bumpScheduleRevision(ctx.db, ctx.academyId);
      ctx.afterCommit(async (exec) => {
        const event = {
          organizationId: ctx.organizationId,
          entityId: ctx.entityId,
          actorRole: eventRole(ctx.membership.role),
        };
        await recordMilestone({ ...event, name: "first_schedule" }, exec);
        await recordActivity({ ...event, name: "staff_action" }, exec);
      });
      return row;
    }),

  /**
   * Change only who is credited for one class — the cover night (spec O10, K.2).
   *
   * Any staff member may set the coach on a class that has not started; once it
   * has, the field is reported history and only an owner may rewrite it
   * (`canReassignCoach`). Reassigning moves that class's O10 figures to the new
   * coach, which is the point: credit always follows the current value.
   */
  setInstructor: staffProcedure
    .input(SetClassInstructorSchema)
    .mutation(async ({ ctx, input }) => {
      await lockAndReadScheduleRevision(ctx.db, ctx.academyId);
      const [before] = await ctx.db
        .select()
        .from(classInstance)
        .where(liveClass(input.id));
      if (!before) {
        throw new TRPCError({ code: "NOT_FOUND", message: CLASS_NOT_FOUND });
      }
      const now = new Date();
      assertCanReassignCoach(ctx.membership, before.startsAt, now);
      if (before.instructorId === input.instructorId) {
        return { ...before, notice: null };
      }
      await requireInstructor(ctx, input.instructorId);

      const [row] = await ctx.db
        .update(classInstance)
        .set({ instructorId: input.instructorId })
        .where(liveClass(input.id))
        .returning();
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: CLASS_NOT_FOUND });
      }
      await bumpScheduleRevision(ctx.db, ctx.academyId);

      const change = classChange(
        { startsAt: before.startsAt, instructorId: before.instructorId },
        { startsAt: row.startsAt, instructorId: row.instructorId },
        now,
      );
      const notice = change.shouldNotify
        ? await notifyBooked(ctx, row, "class_changed", notifyClassChanged)
        : null;
      return { ...row, notice };
    }),

  /** Cancel a class (soft — status only; bookings kept). Notifies booked students (§4). */
  cancel: staffProcedure
    .input(ClassIdSchema)
    .mutation(async ({ ctx, input }) => {
      await lockAndReadScheduleRevision(ctx.db, ctx.academyId);
      const [row] = await ctx.db
        .update(classInstance)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(classInstance.id, input.id),
            isNull(classInstance.deletedAt),
            eq(classInstance.status, "scheduled"),
          ),
        )
        .returning({
          id: classInstance.id,
          title: classInstance.title,
          startsAt: classInstance.startsAt,
          updatedAt: classInstance.updatedAt,
        });
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Class not found or already cancelled",
        });
      }
      await bumpScheduleRevision(ctx.db, ctx.academyId);
      const notice = await notifyBooked(
        ctx,
        row,
        "class_cancelled",
        notifyClassCancelled,
      );
      return { ok: true as const, notice };
    }),
} satisfies TRPCRouterRecord;
