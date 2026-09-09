import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import type { DbExec, DbReader, DbWriter } from "@matops/db";
import {
  and,
  eq,
  findPersonDuplicates,
  getOrganizationPerson,
  inArray,
  isNull,
} from "@matops/db";
import { entity, entityMembership, person, user } from "@matops/db/schema";
import {
  CreateStudentPersonSchema,
  GetPersonSchema,
  PersonDirectorySchema,
  PersonIdSchema,
  PreviewCreatePersonSchema,
} from "@matops/validators";

import {
  organizationManagerIdentityProcedure,
  organizationMemberIdentityProcedure,
} from "../trpc";

const PERSON_NOT_FOUND = "Person not found";
const PERSON_ARCHIVED = "Restore this person before changing them";

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
      return {
        ...row,
        account,
        branches: await branchesForPerson(
          ctx.organizationId,
          row.id,
          ctx.baseDb,
        ),
      };
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
} satisfies TRPCRouterRecord;
