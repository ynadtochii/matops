import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import type { DbExec, DbReader, DbWriter } from "@matops/db";
import {
  and,
  asc,
  backfillLinkedPersonSubjects,
  clearLinkedPersonAccountSubjects,
  countLegacyOnlyPersonSubjects,
  ensureOrganizationAccount,
  eq,
  findPersonDuplicates,
  findVerifiedAccountByEmail,
  getOrganizationPerson,
  gte,
  inArray,
  isNull,
  lt,
  ne,
  or,
  sql,
  withScope,
} from "@matops/db";
import {
  classInstance,
  classParticipation,
  entity,
  entityMembership,
  person,
  personGuardian,
  user,
} from "@matops/db/schema";
import { bookingTier, canBook, notBookableMessage } from "@matops/domain";
import {
  CreateStudentPersonSchema,
  GetPersonSchema,
  GuardianCandidateSchema,
  LinkPersonAccountSchema,
  MySubjectsSchema,
  PersonAccountCandidateSchema,
  PersonClassBookingSchema,
  PersonDirectorySchema,
  PersonGuardianSchema,
  PersonIdSchema,
  PersonScheduleSchema,
  PreviewCreatePersonSchema,
  UnlinkPersonAccountSchema,
} from "@matops/validators";

import {
  claimSeat,
  releaseSeats,
  requireClassFacts,
  SESSION_FULL,
} from "../classes";
import { CLASS_NOT_FOUND } from "../messages";
import { bookingGate } from "../payments-gate";
import {
  organizationManagerIdentityProcedure,
  organizationMemberIdentityProcedure,
} from "../trpc";

const PERSON_NOT_FOUND = "Person not found";
const PERSON_ARCHIVED = "Restore this person before changing them";
const STALE_PERSON = "This person changed. Refresh and try again.";

function sameIds(left: string[], right: string[]) {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((id, index) => id === sortedRight[index])
  );
}

async function requirePerson(
  exec: DbReader,
  organizationId: string,
  personId: string,
) {
  const row = await getOrganizationPerson(exec, organizationId, personId);
  if (!row)
    throw new TRPCError({ code: "NOT_FOUND", message: PERSON_NOT_FOUND });
  return row;
}

async function verifiedAccountById(exec: DbReader, userId: string) {
  const [row] = await exec
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!row?.emailVerified) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "That account has not verified its email",
    });
  }
  return row;
}

async function branchesForPerson(
  organizationId: string,
  personId: string,
  exec: DbExec,
) {
  return exec
    .select({
      enrollmentId: entityMembership.id,
      entityId: entityMembership.entityId,
      entityName: entity.name,
      role: entityMembership.role,
      status: entityMembership.status,
      invitedRole: entityMembership.invitedRole,
      joinedAt: entityMembership.joinedAt,
    })
    .from(entityMembership)
    .innerJoin(entity, eq(entity.id, entityMembership.entityId))
    .where(
      and(
        eq(entityMembership.organizationId, organizationId),
        eq(entityMembership.personId, personId),
      ),
    );
}

export async function enrollStudent(
  exec: DbWriter,
  input: { organizationId: string; entityId: string; personId: string },
) {
  const [held] = await exec
    .select({ id: entityMembership.id })
    .from(entityMembership)
    .where(
      and(
        eq(entityMembership.entityId, input.entityId),
        eq(entityMembership.personId, input.personId),
      ),
    )
    .limit(1);
  if (held) return { enrollmentId: held.id, createdEnrollment: false };
  const [created] = await exec
    .insert(entityMembership)
    .values({
      organizationId: input.organizationId,
      entityId: input.entityId,
      personId: input.personId,
      userId: null,
      role: "student",
      status: "active",
      joinedAt: new Date(),
    })
    .returning({ id: entityMembership.id });
  if (!created) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Could not enroll the student",
    });
  }
  return { enrollmentId: created.id, createdEnrollment: true };
}

async function requireOrganizationEntity(
  exec: DbReader,
  organizationId: string,
  entityId: string,
) {
  const [row] = await exec
    .select({ id: entity.id })
    .from(entity)
    .where(
      and(
        eq(entity.id, entityId),
        eq(entity.organizationId, organizationId),
        eq(entity.status, "active"),
        isNull(entity.deletedAt),
      ),
    )
    .limit(1);
  if (!row) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Branch not found" });
  }
}

async function requireSubjectAccess(
  exec: DbReader,
  input: {
    organizationId: string;
    entityId: string;
    personId: string;
    actorUserId: string;
  },
) {
  const [subject] = await exec
    .select()
    .from(person)
    .where(
      and(
        eq(person.organizationId, input.organizationId),
        eq(person.id, input.personId),
      ),
    )
    .limit(1)
    .for("share");
  if (!subject) {
    throw new TRPCError({ code: "NOT_FOUND", message: PERSON_NOT_FOUND });
  }
  if (subject.archivedAt) {
    throw new TRPCError({ code: "NOT_FOUND", message: PERSON_NOT_FOUND });
  }
  if (subject.accountUserId !== input.actorUserId) {
    const [guardian] = await exec
      .select({ id: personGuardian.id })
      .from(personGuardian)
      .where(
        and(
          eq(personGuardian.organizationId, input.organizationId),
          eq(personGuardian.studentPersonId, input.personId),
          eq(personGuardian.guardianUserId, input.actorUserId),
        ),
      )
      .limit(1)
      .for("share");
    if (!guardian) {
      throw new TRPCError({ code: "NOT_FOUND", message: PERSON_NOT_FOUND });
    }
  }
  const [branch] = await exec
    .select({
      id: entity.id,
      name: entity.name,
      membershipEnforcedAt: entity.membershipEnforcedAt,
      membershipId: entityMembership.id,
      role: entityMembership.role,
      status: entityMembership.status,
      joinedAt: entityMembership.joinedAt,
      createdAt: entityMembership.createdAt,
    })
    .from(entityMembership)
    .innerJoin(entity, eq(entity.id, entityMembership.entityId))
    .where(
      and(
        eq(entity.organizationId, input.organizationId),
        eq(entity.id, input.entityId),
        eq(entity.status, "active"),
        isNull(entity.deletedAt),
        or(
          eq(entityMembership.personId, input.personId),
          subject.accountUserId
            ? and(
                isNull(entityMembership.personId),
                eq(entityMembership.userId, subject.accountUserId),
              )
            : undefined,
        ),
        inArray(entityMembership.status, ["active", "pending"]),
      ),
    )
    .limit(1)
    .for("share");
  if (!branch) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Branch not found" });
  }
  return { subject, branch };
}

async function requirePersonCreator(
  exec: DbReader,
  input: {
    organizationId: string;
    actorUserId: string;
    organizationRole: string;
    entityId?: string;
  },
) {
  if (
    input.organizationRole === "owner" ||
    input.organizationRole === "manager"
  ) {
    return;
  }
  const [staff] = await exec
    .select({ id: entityMembership.id })
    .from(entityMembership)
    .where(
      and(
        eq(entityMembership.organizationId, input.organizationId),
        eq(entityMembership.userId, input.actorUserId),
        input.entityId
          ? eq(entityMembership.entityId, input.entityId)
          : undefined,
        eq(entityMembership.status, "active"),
        inArray(entityMembership.role, ["owner", "instructor"]),
      ),
    )
    .limit(1);
  if (!staff) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Staff only" });
  }
}

export const personRouter = {
  previewCreateStudent: organizationMemberIdentityProcedure
    .input(PreviewCreatePersonSchema)
    .query(async ({ ctx, input }) => {
      await requirePersonCreator(ctx.baseDb, {
        organizationId: ctx.organizationId,
        actorUserId: ctx.session.user.id,
        organizationRole: ctx.orgMembership.role,
      });
      return findPersonDuplicates(ctx.baseDb, {
        organizationId: ctx.organizationId,
        ...input,
      });
    }),

  createStudent: organizationMemberIdentityProcedure
    .input(CreateStudentPersonSchema)
    .mutation(async ({ ctx, input }) => {
      await requirePersonCreator(ctx.baseDb, {
        organizationId: ctx.organizationId,
        actorUserId: ctx.session.user.id,
        organizationRole: ctx.orgMembership.role,
        entityId: input.entityId,
      });
      await requireOrganizationEntity(
        ctx.baseDb,
        ctx.organizationId,
        input.entityId,
      );
      return ctx.baseDb.transaction(async (db) => {
        const duplicates = await findPersonDuplicates(db, {
          organizationId: ctx.organizationId,
          ...input,
        });
        const duplicateIds = duplicates.map((row) => row.personId);
        const decision = input.duplicateDecision;
        if (duplicates.length > 0 && !decision) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "Review the possible duplicate before creating this person",
          });
        }
        if (decision?.kind === "create_separate") {
          if (!sameIds(duplicateIds, decision.reviewedPersonIds)) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "The possible duplicates changed. Review them again.",
            });
          }
        }
        if (decision?.kind === "use_existing") {
          const selected = duplicates.find(
            (row) => row.personId === decision.personId,
          );
          if (!selected) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "That person is no longer a possible duplicate",
            });
          }
          if (selected.archivedAt) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: PERSON_ARCHIVED,
            });
          }
          return {
            personId: selected.personId,
            createdPerson: false,
            duplicateReasons: selected.reasons,
            ...(await enrollStudent(db, {
              organizationId: ctx.organizationId,
              entityId: input.entityId,
              personId: selected.personId,
            })),
          };
        }
        const [created] = await db
          .insert(person)
          .values({
            organizationId: ctx.organizationId,
            name: input.name,
            email: input.email ?? null,
            phone: input.phone ?? null,
          })
          .returning({ id: person.id });
        if (!created) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not create the student",
          });
        }
        return {
          personId: created.id,
          createdPerson: true,
          duplicateReasons: [],
          ...(await enrollStudent(db, {
            organizationId: ctx.organizationId,
            entityId: input.entityId,
            personId: created.id,
          })),
        };
      });
    }),

  schedule: organizationMemberIdentityProcedure
    .input(PersonScheduleSchema)
    .query(async ({ ctx, input }) => {
      return withScope(
        { organizationId: ctx.organizationId, entityId: input.entityId },
        async (db) => {
          const { subject } = await requireSubjectAccess(db, {
            organizationId: ctx.organizationId,
            entityId: input.entityId,
            personId: input.personId,
            actorUserId: ctx.session.user.id,
          });
          return db
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
              myBooking: classParticipation.bookingStatus,
              myBookingTier: classParticipation.bookingTier,
            })
            .from(classInstance)
            .leftJoin(user, eq(user.id, classInstance.instructorId))
            .leftJoin(
              classParticipation,
              and(
                eq(classParticipation.classId, classInstance.id),
                or(
                  eq(classParticipation.personId, subject.id),
                  subject.accountUserId
                    ? and(
                        isNull(classParticipation.personId),
                        eq(classParticipation.studentId, subject.accountUserId),
                      )
                    : undefined,
                ),
              ),
            )
            .where(
              and(
                isNull(classInstance.deletedAt),
                gte(classInstance.startsAt, new Date(input.from)),
                lt(classInstance.startsAt, new Date(input.to)),
              ),
            )
            .orderBy(asc(classInstance.startsAt));
        },
        ctx.baseDb,
      );
    }),

  bookClass: organizationMemberIdentityProcedure
    .input(PersonClassBookingSchema)
    .mutation(async ({ ctx, input }) => {
      return withScope(
        { organizationId: ctx.organizationId, entityId: input.entityId },
        async (db) => {
          const { subject, branch } = await requireSubjectAccess(db, {
            organizationId: ctx.organizationId,
            entityId: input.entityId,
            personId: input.personId,
            actorUserId: ctx.session.user.id,
          });
          const cls = await requireClassFacts(db, input.classId);
          const bookable = canBook(cls, new Date());
          if (bookable.reason === "deleted") {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: CLASS_NOT_FOUND,
            });
          }
          if (bookable.reason) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: notBookableMessage(bookable.reason),
            });
          }
          const membership = {
            memberId: branch.membershipId,
            personId: subject.id,
            role: branch.role,
            status: branch.status,
            joinedAt: branch.joinedAt ?? branch.createdAt,
          };
          const gate = await bookingGate(db, {
            entity: {
              id: branch.id,
              name: branch.name,
              membershipEnforcedAt: branch.membershipEnforcedAt,
            },
            membership,
            accountUserId: subject.accountUserId,
            sessionAt: cls.startsAt,
          });
          if (gate.locked) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: gate.message ?? "Booking is locked for this person.",
            });
          }
          const tier = gate.provisional
            ? ("provisional" as const)
            : bookingTier(membership);
          const [transition] = await db
            .insert(classParticipation)
            .values({
              academyId: input.entityId,
              classId: input.classId,
              personOrganizationId: ctx.organizationId,
              personId: subject.id,
              studentId: subject.accountUserId,
              bookingStatus: "booked",
              bookingTier: tier,
              cancelledAt: null,
            })
            .onConflictDoUpdate({
              target: [classParticipation.classId, classParticipation.personId],
              targetWhere: sql`person_id is not null`,
              set: {
                bookingStatus: "booked",
                bookingTier: tier,
                cancelledAt: null,
              },
              setWhere: ne(classParticipation.bookingStatus, "booked"),
            })
            .returning({ id: classParticipation.id });
          if (transition && tier === "confirmed") {
            const took = await claimSeat(db, input.classId);
            if (!took) {
              throw new TRPCError({ code: "CONFLICT", message: SESSION_FULL });
            }
          }
          return { ok: true as const, tier };
        },
        ctx.baseDb,
      );
    }),

  cancelBooking: organizationMemberIdentityProcedure
    .input(PersonClassBookingSchema)
    .mutation(async ({ ctx, input }) => {
      return withScope(
        { organizationId: ctx.organizationId, entityId: input.entityId },
        async (db) => {
          const { subject } = await requireSubjectAccess(db, {
            organizationId: ctx.organizationId,
            entityId: input.entityId,
            personId: input.personId,
            actorUserId: ctx.session.user.id,
          });
          const [cancelled] = await db
            .update(classParticipation)
            .set({ bookingStatus: "cancelled", cancelledAt: new Date() })
            .where(
              and(
                eq(classParticipation.classId, input.classId),
                or(
                  eq(classParticipation.personId, subject.id),
                  subject.accountUserId
                    ? and(
                        isNull(classParticipation.personId),
                        eq(classParticipation.studentId, subject.accountUserId),
                      )
                    : undefined,
                ),
                eq(classParticipation.bookingStatus, "booked"),
              ),
            )
            .returning({ tier: classParticipation.bookingTier });
          if (cancelled?.tier === "confirmed") {
            await releaseSeats(db, [input.classId]);
          }
          return { ok: true as const };
        },
        ctx.baseDb,
      );
    }),

  directory: organizationManagerIdentityProcedure
    .input(PersonDirectorySchema)
    .query(async ({ ctx, input }) => {
      const rows = await ctx.baseDb
        .select()
        .from(person)
        .where(
          and(
            eq(person.organizationId, ctx.organizationId),
            input?.includeArchived ? undefined : isNull(person.archivedAt),
          ),
        )
        .orderBy(person.name, person.id);
      return Promise.all(
        rows.map(async (row) => ({
          ...row,
          branches: await branchesForPerson(
            ctx.organizationId,
            row.id,
            ctx.baseDb,
          ),
        })),
      );
    }),

  get: organizationManagerIdentityProcedure
    .input(GetPersonSchema)
    .query(async ({ ctx, input }) => {
      const row = await requirePerson(
        ctx.baseDb,
        ctx.organizationId,
        input.personId,
      );
      if (row.archivedAt && !input.includeArchived) {
        throw new TRPCError({ code: "NOT_FOUND", message: PERSON_NOT_FOUND });
      }
      const account = row.accountUserId
        ? await ctx.baseDb
            .select({ userId: user.id, name: user.name, email: user.email })
            .from(user)
            .where(eq(user.id, row.accountUserId))
            .limit(1)
            .then((found) => found[0] ?? null)
        : null;
      const guardians = await ctx.baseDb
        .select({
          relationId: personGuardian.id,
          userId: user.id,
          name: user.name,
          email: user.email,
          createdAt: personGuardian.createdAt,
          createdByUserId: personGuardian.createdByUserId,
        })
        .from(personGuardian)
        .innerJoin(user, eq(user.id, personGuardian.guardianUserId))
        .where(
          and(
            eq(personGuardian.organizationId, ctx.organizationId),
            eq(personGuardian.studentPersonId, row.id),
          ),
        );
      return {
        ...row,
        account,
        guardians,
        branches: await branchesForPerson(
          ctx.organizationId,
          row.id,
          ctx.baseDb,
        ),
      };
    }),

  accountCandidate: organizationManagerIdentityProcedure
    .input(PersonAccountCandidateSchema)
    .query(async ({ ctx, input }) => {
      await requirePerson(ctx.baseDb, ctx.organizationId, input.personId);
      const account = await findVerifiedAccountByEmail(ctx.baseDb, input.email);
      if (!account) return null;
      const [linked] = await ctx.baseDb
        .select({ personId: person.id })
        .from(person)
        .where(
          and(
            eq(person.organizationId, ctx.organizationId),
            eq(person.accountUserId, account.userId),
          ),
        )
        .limit(1);
      return { ...account, linkedPersonId: linked?.personId ?? null };
    }),

  linkAccount: organizationManagerIdentityProcedure
    .input(LinkPersonAccountSchema)
    .mutation(async ({ ctx, input }) => {
      const target = await requirePerson(
        ctx.baseDb,
        ctx.organizationId,
        input.personId,
      );
      if (target.archivedAt) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: PERSON_ARCHIVED,
        });
      }
      if (target.updatedAt.toISOString() !== input.expectedUpdatedAt) {
        throw new TRPCError({ code: "CONFLICT", message: STALE_PERSON });
      }
      await verifiedAccountById(ctx.baseDb, input.accountUserId);
      const [linked] = await ctx.baseDb
        .select({ personId: person.id })
        .from(person)
        .where(
          and(
            eq(person.organizationId, ctx.organizationId),
            eq(person.accountUserId, input.accountUserId),
          ),
        )
        .limit(1);
      if (linked && linked.personId !== target.id) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "That account is linked to another person",
        });
      }
      const saved = await ctx.baseDb.transaction(async (db) => {
        await ensureOrganizationAccount(db, {
          organizationId: ctx.organizationId,
          userId: input.accountUserId,
        });
        const [updated] = await db
          .update(person)
          .set({ accountUserId: input.accountUserId })
          .where(
            and(
              eq(person.organizationId, ctx.organizationId),
              eq(person.id, target.id),
              eq(person.updatedAt, target.updatedAt),
            ),
          )
          .returning({ updatedAt: person.updatedAt });
        if (!updated) {
          throw new TRPCError({ code: "CONFLICT", message: STALE_PERSON });
        }
        const backfill = await backfillLinkedPersonSubjects(db, {
          organizationId: ctx.organizationId,
          personId: target.id,
          userId: input.accountUserId,
        });
        if (backfill.collision) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "The account already has a separate branch record",
          });
        }
        return updated;
      });
      return {
        personId: target.id,
        accountUserId: input.accountUserId,
        updatedAt: saved.updatedAt,
      };
    }),

  unlinkAccount: organizationManagerIdentityProcedure
    .input(UnlinkPersonAccountSchema)
    .mutation(async ({ ctx, input }) => {
      const target = await requirePerson(
        ctx.baseDb,
        ctx.organizationId,
        input.personId,
      );
      if (
        target.updatedAt.toISOString() !== input.expectedUpdatedAt ||
        target.accountUserId !== input.expectedAccountUserId
      ) {
        throw new TRPCError({ code: "CONFLICT", message: STALE_PERSON });
      }
      const legacyRows = await countLegacyOnlyPersonSubjects(ctx.baseDb, {
        organizationId: ctx.organizationId,
        userId: input.expectedAccountUserId,
      });
      if (legacyRows > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Historical records still need a person link",
        });
      }
      const saved = await ctx.baseDb.transaction(async (db) => {
        await clearLinkedPersonAccountSubjects(db, {
          organizationId: ctx.organizationId,
          personId: target.id,
          userId: input.expectedAccountUserId,
        });
        const [updated] = await db
          .update(person)
          .set({ accountUserId: null })
          .where(
            and(
              eq(person.organizationId, ctx.organizationId),
              eq(person.id, target.id),
              eq(person.accountUserId, input.expectedAccountUserId),
              eq(person.updatedAt, target.updatedAt),
            ),
          )
          .returning({ updatedAt: person.updatedAt });
        if (!updated) {
          throw new TRPCError({ code: "CONFLICT", message: STALE_PERSON });
        }
        return updated;
      });
      return { personId: target.id, updatedAt: saved.updatedAt };
    }),

  guardianCandidate: organizationManagerIdentityProcedure
    .input(GuardianCandidateSchema)
    .query(async ({ ctx, input }) => {
      await requirePerson(
        ctx.baseDb,
        ctx.organizationId,
        input.studentPersonId,
      );
      return findVerifiedAccountByEmail(ctx.baseDb, input.email);
    }),

  addGuardian: organizationManagerIdentityProcedure
    .input(PersonGuardianSchema)
    .mutation(async ({ ctx, input }) => {
      const student = await requirePerson(
        ctx.baseDb,
        ctx.organizationId,
        input.studentPersonId,
      );
      if (student.archivedAt) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: PERSON_ARCHIVED,
        });
      }
      if (student.accountUserId === input.guardianUserId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "A person cannot be their own guardian",
        });
      }
      await verifiedAccountById(ctx.baseDb, input.guardianUserId);
      const [created] = await ctx.baseDb.transaction(async (db) => {
        await ensureOrganizationAccount(db, {
          organizationId: ctx.organizationId,
          userId: input.guardianUserId,
        });
        return db
          .insert(personGuardian)
          .values({
            organizationId: ctx.organizationId,
            studentPersonId: student.id,
            guardianUserId: input.guardianUserId,
            createdByUserId: ctx.session.user.id,
          })
          .onConflictDoNothing({
            target: [
              personGuardian.organizationId,
              personGuardian.studentPersonId,
              personGuardian.guardianUserId,
            ],
          })
          .returning({ id: personGuardian.id });
      });
      return { created: created !== undefined };
    }),

  removeGuardian: organizationManagerIdentityProcedure
    .input(PersonGuardianSchema)
    .mutation(async ({ ctx, input }) => {
      await requirePerson(
        ctx.baseDb,
        ctx.organizationId,
        input.studentPersonId,
      );
      const removed = await ctx.baseDb
        .delete(personGuardian)
        .where(
          and(
            eq(personGuardian.organizationId, ctx.organizationId),
            eq(personGuardian.studentPersonId, input.studentPersonId),
            eq(personGuardian.guardianUserId, input.guardianUserId),
          ),
        )
        .returning({ id: personGuardian.id });
      return { removed: removed.length > 0 };
    }),

  archive: organizationManagerIdentityProcedure
    .input(PersonIdSchema)
    .mutation(async ({ ctx, input }) => {
      const target = await requirePerson(
        ctx.baseDb,
        ctx.organizationId,
        input.personId,
      );
      if (target.archivedAt)
        return { changed: false, archivedAt: target.archivedAt };
      const [saved] = await ctx.baseDb
        .update(person)
        .set({ archivedAt: new Date() })
        .where(
          and(
            eq(person.organizationId, ctx.organizationId),
            eq(person.id, target.id),
            isNull(person.archivedAt),
          ),
        )
        .returning({ archivedAt: person.archivedAt });
      return {
        changed: saved !== undefined,
        archivedAt: saved?.archivedAt ?? null,
      };
    }),

  restore: organizationManagerIdentityProcedure
    .input(PersonIdSchema)
    .mutation(async ({ ctx, input }) => {
      const target = await requirePerson(
        ctx.baseDb,
        ctx.organizationId,
        input.personId,
      );
      if (!target.archivedAt) return { changed: false };
      const [saved] = await ctx.baseDb
        .update(person)
        .set({ archivedAt: null })
        .where(
          and(
            eq(person.organizationId, ctx.organizationId),
            eq(person.id, target.id),
          ),
        )
        .returning({ id: person.id });
      return { changed: saved !== undefined };
    }),

  mySubjects: organizationMemberIdentityProcedure
    .input(MySubjectsSchema)
    .query(async ({ ctx, input }) => {
      if (input?.entityId) {
        const [owned] = await ctx.baseDb
          .select({ id: entity.id })
          .from(entity)
          .where(
            and(
              eq(entity.organizationId, ctx.organizationId),
              eq(entity.id, input.entityId),
              isNull(entity.deletedAt),
            ),
          )
          .limit(1);
        if (!owned) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Branch not found",
          });
        }
      }
      const guarded = await ctx.baseDb
        .select({ personId: personGuardian.studentPersonId })
        .from(personGuardian)
        .where(
          and(
            eq(personGuardian.organizationId, ctx.organizationId),
            eq(personGuardian.guardianUserId, ctx.session.user.id),
          ),
        );
      const subjectIds = guarded.map((row) => row.personId);
      const rows = await ctx.baseDb
        .select({
          personId: person.id,
          name: person.name,
          accountUserId: person.accountUserId,
        })
        .from(person)
        .where(
          and(
            eq(person.organizationId, ctx.organizationId),
            isNull(person.archivedAt),
            or(
              eq(person.accountUserId, ctx.session.user.id),
              subjectIds.length > 0
                ? inArray(person.id, subjectIds)
                : undefined,
            ),
          ),
        );
      const activeIds = input?.entityId
        ? new Set(
            (
              await ctx.baseDb
                .select({ personId: entityMembership.personId })
                .from(entityMembership)
                .where(
                  and(
                    eq(entityMembership.organizationId, ctx.organizationId),
                    eq(entityMembership.entityId, input.entityId),
                    eq(entityMembership.role, "student"),
                    inArray(entityMembership.status, ["active", "pending"]),
                    inArray(
                      entityMembership.personId,
                      rows.map((row) => row.personId),
                    ),
                  ),
                )
            ).flatMap((row) => (row.personId ? [row.personId] : [])),
          )
        : null;
      return rows
        .filter((row) => !activeIds || activeIds.has(row.personId))
        .map((row) => ({
          ...row,
          relationship:
            row.accountUserId === ctx.session.user.id
              ? ("self" as const)
              : ("guardian" as const),
        }));
    }),
} satisfies TRPCRouterRecord;
