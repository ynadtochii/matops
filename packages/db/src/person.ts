import { randomUUID } from "node:crypto";
import { and, eq, isNull, or, sql } from "drizzle-orm";

import type { DbReader, DbWriter } from "./tenant";
import {
  accessAssignment,
  accessAssignmentChange,
  classParticipation,
  entity,
  entityMembership,
  member,
  membershipPurchase,
  person,
  user,
} from "./schema";

export interface PersonDuplicate {
  personId: string;
  name: string;
  email: string | null;
  phone: string | null;
  archivedAt: Date | null;
  reasons: ("name" | "email" | "phone")[];
}

export async function findPersonDuplicates(
  exec: DbReader,
  input: {
    organizationId: string;
    name: string;
    email?: string | null;
    phone?: string | null;
  },
): Promise<PersonDuplicate[]> {
  const name = input.name.trim().toLowerCase();
  const email = input.email?.trim().toLowerCase() ?? null;
  const phone = input.phone?.trim() ?? null;
  const matches = await exec
    .select({
      personId: person.id,
      name: person.name,
      email: person.email,
      phone: person.phone,
      archivedAt: person.archivedAt,
    })
    .from(person)
    .where(
      and(
        eq(person.organizationId, input.organizationId),
        or(
          eq(sql`lower(${person.name})`, name),
          email ? eq(sql`lower(${person.email})`, email) : undefined,
          phone ? eq(person.phone, phone) : undefined,
        ),
      ),
    );
  return matches.map((row) => ({
    ...row,
    reasons: [
      ...(row.name.trim().toLowerCase() === name ? (["name"] as const) : []),
      ...(email && row.email?.trim().toLowerCase() === email
        ? (["email"] as const)
        : []),
      ...(phone && row.phone === phone ? (["phone"] as const) : []),
    ],
  }));
}

export async function getOrganizationPerson(
  exec: DbReader,
  organizationId: string,
  personId: string,
) {
  const [row] = await exec
    .select()
    .from(person)
    .where(
      and(eq(person.organizationId, organizationId), eq(person.id, personId)),
    )
    .limit(1);
  return row ?? null;
}

export async function findVerifiedAccountByEmail(
  exec: DbReader,
  email: string,
) {
  const [row] = await exec
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
    })
    .from(user)
    .where(eq(sql`lower(${user.email})`, email.trim().toLowerCase()))
    .limit(1);
  return row?.emailVerified ? row : null;
}

export async function ensureOrganizationAccount(
  exec: DbWriter,
  input: { organizationId: string; userId: string },
) {
  await exec
    .insert(member)
    .values({
      id: randomUUID(),
      organizationId: input.organizationId,
      userId: input.userId,
      role: "member",
      createdAt: new Date(),
    })
    .onConflictDoNothing({ target: [member.organizationId, member.userId] });
}

export async function backfillLinkedPersonSubjects(
  exec: DbWriter,
  input: { organizationId: string; personId: string; userId: string },
) {
  const membershipRows = await exec
    .select({ id: entityMembership.id, entityId: entityMembership.entityId })
    .from(entityMembership)
    .where(
      and(
        eq(entityMembership.organizationId, input.organizationId),
        or(
          eq(entityMembership.userId, input.userId),
          eq(entityMembership.personId, input.personId),
        ),
      ),
    );
  const collision = membershipRows.find((row, index) =>
    membershipRows.some(
      (other, otherIndex) =>
        otherIndex !== index &&
        other.entityId === row.entityId &&
        other.id !== row.id,
    ),
  );
  if (collision) return { collision: "branch" as const };

  await exec
    .update(entityMembership)
    .set({ personId: input.personId })
    .where(
      and(
        eq(entityMembership.organizationId, input.organizationId),
        eq(entityMembership.userId, input.userId),
        isNull(entityMembership.personId),
      ),
    );
  await exec
    .update(entityMembership)
    .set({ userId: input.userId })
    .where(
      and(
        eq(entityMembership.organizationId, input.organizationId),
        eq(entityMembership.personId, input.personId),
        isNull(entityMembership.userId),
      ),
    );
  await exec
    .update(accessAssignment)
    .set({ personId: input.personId })
    .where(
      and(
        eq(accessAssignment.organizationId, input.organizationId),
        eq(accessAssignment.userId, input.userId),
        isNull(accessAssignment.personId),
      ),
    );
  await exec
    .update(accessAssignmentChange)
    .set({ personId: input.personId })
    .where(
      and(
        eq(accessAssignmentChange.organizationId, input.organizationId),
        eq(accessAssignmentChange.userId, input.userId),
        isNull(accessAssignmentChange.personId),
      ),
    );
  await exec
    .update(membershipPurchase)
    .set({ personId: input.personId })
    .where(
      and(
        eq(membershipPurchase.organizationId, input.organizationId),
        eq(membershipPurchase.userId, input.userId),
        isNull(membershipPurchase.personId),
      ),
    );
  await exec
    .update(classParticipation)
    .set({
      personOrganizationId: input.organizationId,
      personId: input.personId,
    })
    .where(
      and(
        eq(classParticipation.studentId, input.userId),
        isNull(classParticipation.personId),
        sql`exists (select 1 from ${entity} where ${entity.id} = ${classParticipation.academyId} and ${entity.organizationId} = ${input.organizationId})`,
      ),
    );
  return { collision: null };
}

export async function countLegacyOnlyPersonSubjects(
  exec: DbReader,
  input: { organizationId: string; userId: string },
): Promise<number> {
  const queries = [
    exec
      .select({ count: sql<number>`count(*)::int` })
      .from(entityMembership)
      .where(
        and(
          eq(entityMembership.organizationId, input.organizationId),
          eq(entityMembership.userId, input.userId),
          isNull(entityMembership.personId),
        ),
      ),
    exec
      .select({ count: sql<number>`count(*)::int` })
      .from(accessAssignment)
      .where(
        and(
          eq(accessAssignment.organizationId, input.organizationId),
          eq(accessAssignment.userId, input.userId),
          isNull(accessAssignment.personId),
        ),
      ),
    exec
      .select({ count: sql<number>`count(*)::int` })
      .from(accessAssignmentChange)
      .where(
        and(
          eq(accessAssignmentChange.organizationId, input.organizationId),
          eq(accessAssignmentChange.userId, input.userId),
          isNull(accessAssignmentChange.personId),
        ),
      ),
    exec
      .select({ count: sql<number>`count(*)::int` })
      .from(membershipPurchase)
      .where(
        and(
          eq(membershipPurchase.organizationId, input.organizationId),
          eq(membershipPurchase.userId, input.userId),
          isNull(membershipPurchase.personId),
        ),
      ),
    exec
      .select({ count: sql<number>`count(*)::int` })
      .from(classParticipation)
      .where(
        and(
          eq(classParticipation.studentId, input.userId),
          isNull(classParticipation.personId),
          sql`exists (select 1 from ${entity} where ${entity.id} = ${classParticipation.academyId} and ${entity.organizationId} = ${input.organizationId})`,
        ),
      ),
  ];
  const rows = await Promise.all(queries);
  return rows.reduce((total, result) => total + (result[0]?.count ?? 0), 0);
}

export async function clearLinkedPersonAccountSubjects(
  exec: DbWriter,
  input: { organizationId: string; personId: string; userId: string },
) {
  await exec
    .update(entityMembership)
    .set({ userId: null })
    .where(
      and(
        eq(entityMembership.organizationId, input.organizationId),
        eq(entityMembership.personId, input.personId),
        eq(entityMembership.userId, input.userId),
      ),
    );
  await exec
    .update(accessAssignment)
    .set({ userId: null })
    .where(
      and(
        eq(accessAssignment.organizationId, input.organizationId),
        eq(accessAssignment.personId, input.personId),
        eq(accessAssignment.userId, input.userId),
      ),
    );
  await exec
    .update(accessAssignmentChange)
    .set({ userId: null })
    .where(
      and(
        eq(accessAssignmentChange.organizationId, input.organizationId),
        eq(accessAssignmentChange.personId, input.personId),
        eq(accessAssignmentChange.userId, input.userId),
      ),
    );
  await exec
    .update(membershipPurchase)
    .set({ userId: null })
    .where(
      and(
        eq(membershipPurchase.organizationId, input.organizationId),
        eq(membershipPurchase.personId, input.personId),
        eq(membershipPurchase.userId, input.userId),
      ),
    );
  await exec
    .update(classParticipation)
    .set({ studentId: null })
    .where(
      and(
        eq(classParticipation.personOrganizationId, input.organizationId),
        eq(classParticipation.personId, input.personId),
        eq(classParticipation.studentId, input.userId),
      ),
    );
}
