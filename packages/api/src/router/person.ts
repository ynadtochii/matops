import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";

import type { DbReader, DbWriter } from "@matops/db";
import { and, eq, findPersonDuplicates, inArray, isNull } from "@matops/db";
import { entity, entityMembership, person } from "@matops/db/schema";
import {
  CreateStudentPersonSchema,
  PreviewCreatePersonSchema,
} from "@matops/validators";

import { organizationMemberIdentityProcedure } from "../trpc";

const PERSON_ARCHIVED = "Restore this person before changing them";

export function sameIds(left: string[], right: string[]) {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((id, index) => id === sortedRight[index])
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
      message: "Couldn't enrol the student. Try again.",
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
            message: "Couldn't create the student. Try again.",
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
} satisfies TRPCRouterRecord;
