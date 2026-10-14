import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import type { TenantTx } from "@matops/db";
import {
  and,
  asc,
  bumpScheduleRevision,
  eq,
  getOrCreateDeskLink,
  gte,
  isNull,
  lockAndReadScheduleRevision,
  lt,
  rotateDeskLink,
  sql,
} from "@matops/db";
import {
  classInstance,
  classParticipation,
  entityMembership,
  person,
  user,
} from "@matops/db/schema";
import {
  canUndoDeskCheckIn,
  DESK_SOURCE,
  deskClasses,
  deskDefaultClass,
  deskNames,
  deskSearch,
  deskWindow,
  isActiveMember,
} from "@matops/domain";
import {
  DeskCheckInSchema,
  DeskRosterSchema,
  DeskSearchSchema,
  DeskUndoSchema,
} from "@matops/validators";

import { releaseSeats } from "../classes";
import { checkInMember } from "../member-checkin";
import { branchManagerIdentityProcedure, deskProcedure } from "../trpc";

const TALK_TO_DESK = "Please talk to the desk.";

interface DeskMember {
  id: string;
  personId: string | null;
  accountUserId: string | null;
  name: string;
  role: string;
  status: string;
  joinedAt: Date;
}

async function activeMembers(db: TenantTx, academyId: string) {
  const rows: DeskMember[] = await db
    .select({
      id: entityMembership.id,
      personId: entityMembership.personId,
      accountUserId: sql<
        string | null
      >`coalesce(${person.accountUserId}, ${entityMembership.userId})`,
      name: sql<string>`coalesce(${person.name}, ${user.name}, '')`,
      role: entityMembership.role,
      status: entityMembership.status,
      joinedAt: sql<Date>`coalesce(${entityMembership.joinedAt}, ${entityMembership.createdAt})`,
    })
    .from(entityMembership)
    .leftJoin(person, eq(entityMembership.personId, person.id))
    .leftJoin(user, eq(entityMembership.userId, user.id))
    .where(
      and(
        eq(entityMembership.entityId, academyId),
        eq(entityMembership.status, "active"),
      ),
    );
  return rows.filter((m) => m.name.trim().length > 0);
}

async function participantsOf(db: TenantTx, classId: string) {
  return db
    .select({
      personId: classParticipation.personId,
      studentId: classParticipation.studentId,
      bookingStatus: classParticipation.bookingStatus,
      attendanceStatus: classParticipation.attendanceStatus,
    })
    .from(classParticipation)
    .where(eq(classParticipation.classId, classId));
}

type Participant = Awaited<ReturnType<typeof participantsOf>>[number];

function participantFor(m: DeskMember, rows: Participant[]) {
  return rows.find((p) =>
    p.personId
      ? p.personId === m.personId
      : m.accountUserId !== null && p.studentId === m.accountUserId,
  );
}

async function deskClassesNow(db: TenantTx, timeZone: string) {
  const now = new Date();
  const window = deskWindow(now, timeZone);
  const rows = await db
    .select({
      id: classInstance.id,
      title: classInstance.title,
      startsAt: classInstance.startsAt,
      durationMinutes: classInstance.durationMinutes,
      status: classInstance.status,
    })
    .from(classInstance)
    .where(
      and(
        isNull(classInstance.deletedAt),
        gte(classInstance.startsAt, window.from),
        lt(classInstance.startsAt, window.to),
      ),
    )
    .orderBy(asc(classInstance.startsAt));
  return deskClasses(rows, now, timeZone);
}

function present(p: Participant | undefined) {
  return p?.bookingStatus === "booked" && p.attendanceStatus === "present";
}

export const deskRouter = {
  link: branchManagerIdentityProcedure.query(({ ctx }) =>
    getOrCreateDeskLink(
      { academyId: ctx.academyId, createdBy: ctx.session.user.id },
      ctx.baseDb,
    ),
  ),

  rotateLink: branchManagerIdentityProcedure.mutation(({ ctx }) =>
    rotateDeskLink(
      { academyId: ctx.academyId, createdBy: ctx.session.user.id },
      ctx.baseDb,
    ),
  ),

  classes: deskProcedure.query(async ({ ctx }) => {
    const shown = await deskClassesNow(ctx.db, ctx.desk.timeZone);
    const classes = shown.classes.map((c) => ({
      id: c.id,
      title: c.title,
      startsAt: c.startsAt,
      durationMinutes: c.durationMinutes,
      open: c.open,
      opensAt: c.opensAt,
    }));
    return {
      academy: { name: ctx.desk.name, timeZone: ctx.desk.timeZone },
      tomorrow: shown.tomorrow,
      classes,
      defaultClassId: deskDefaultClass(classes)?.id ?? null,
    };
  }),

  roster: deskProcedure
    .input(DeskRosterSchema)
    .query(async ({ ctx, input }) => {
      const members = await activeMembers(ctx.db, ctx.academyId);
      const names = deskNames(members);
      const rows = await participantsOf(ctx.db, input.classId);
      return members
        .map((m) => ({ member: m, row: participantFor(m, rows) }))
        .filter(({ row }) => row?.bookingStatus === "booked")
        .map(({ member, row }) => ({
          memberId: member.id,
          name: names.get(member.id) ?? "",
          present: present(row),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }),

  search: deskProcedure
    .input(DeskSearchSchema)
    .query(async ({ ctx, input }) => {
      const members = await activeMembers(ctx.db, ctx.academyId);
      const names = deskNames(members);
      const rows = await participantsOf(ctx.db, input.classId);
      return deskSearch(members, input.query).map((m) => ({
        memberId: m.id,
        name: names.get(m.id) ?? "",
        present: present(participantFor(m, rows)),
      }));
    }),

  checkIn: deskProcedure
    .input(DeskCheckInSchema)
    .mutation(async ({ ctx, input }) => {
      const [m] = await ctx.db
        .select({
          id: entityMembership.id,
          personId: entityMembership.personId,
          accountUserId: sql<
            string | null
          >`coalesce(${person.accountUserId}, ${entityMembership.userId})`,
          role: entityMembership.role,
          status: entityMembership.status,
          joinedAt: sql<Date>`coalesce(${entityMembership.joinedAt}, ${entityMembership.createdAt})`,
        })
        .from(entityMembership)
        .leftJoin(person, eq(entityMembership.personId, person.id))
        .where(
          and(
            eq(entityMembership.id, input.memberId),
            eq(entityMembership.entityId, ctx.academyId),
          ),
        );
      if (!m || !isActiveMember(m) || (!m.personId && !m.accountUserId)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: TALK_TO_DESK,
        });
      }
      const shown = await deskClassesNow(ctx.db, ctx.desk.timeZone);
      if (!shown.classes.some((c) => c.id === input.classId && c.open)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Check-in for this class isn't open yet.",
        });
      }
      const result = await checkInMember(ctx.db, {
        classId: input.classId,
        entity: ctx.desk,
        organizationId: ctx.desk.organizationId,
        membership: {
          memberId: m.id,
          personId: m.personId,
          role: m.role,
          status: m.status,
          joinedAt: new Date(m.joinedAt),
        },
        accountUserId: m.accountUserId,
        source: DESK_SOURCE,
        checkWindow: false,
      });
      return { participationId: result.participationId, booked: result.booked };
    }),

  undo: deskProcedure.input(DeskUndoSchema).mutation(async ({ ctx, input }) => {
    if (input.booked) {
      await lockAndReadScheduleRevision(ctx.db, ctx.academyId);
    }
    const [row] = await ctx.db
      .select({
        classId: classParticipation.classId,
        bookingTier: classParticipation.bookingTier,
        checkInSource: classParticipation.checkInSource,
        markedBy: classParticipation.markedBy,
        attendanceStatus: classParticipation.attendanceStatus,
        attendedAt: classParticipation.attendedAt,
      })
      .from(classParticipation)
      .where(eq(classParticipation.id, input.participationId))
      .for("update");
    if (!row || !canUndoDeskCheckIn(row, new Date())) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "It's too late to undo. Please ask the staff to fix it.",
      });
    }
    await ctx.db
      .update(classParticipation)
      .set({
        attendanceStatus: "unmarked",
        attendedAt: null,
        checkInSource: null,
        ...(input.booked
          ? { bookingStatus: "cancelled" as const, cancelledAt: new Date() }
          : {}),
      })
      .where(eq(classParticipation.id, input.participationId));
    if (input.booked) {
      if (row.bookingTier === "confirmed") {
        await releaseSeats(ctx.db, [row.classId]);
      }
      await bumpScheduleRevision(ctx.db, ctx.academyId);
    }
    return { ok: true as const };
  }),
} satisfies TRPCRouterRecord;
